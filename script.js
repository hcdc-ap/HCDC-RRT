// ===============================
// ⚡ SUPABASE SINGLETON INIT - CHỈ CHẠY 1 LẦN DUY NHẤT
// ===============================
(function initSupabaseSingleton() {
  // ✅ Nếu đã có instance hợp lệ thì return ngay
  if (window.supabaseClient?.auth?.getSession) {
    console.log('✅ Supabase singleton already initialized');
    return window.supabaseClient;
  }

  const SUPABASE_URL = 'https://sxzjbygiowpscyhiffqc.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4empieWdpb3dwc2N5aGlmZnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMTI4MjEsImV4cCI6MjA5NDc4ODgyMX0.Qfz4b4GBDAQV4aO-ca1WFKUM1lbCWqjhItkm1YCnm1k';
  // Biến toàn cục để lưu trữ tất cả dữ liệu từ server
  // Thêm đoạn này vào đầu script.js, ngay sau khi supabaseClient xong (nếu có) hoặc gần đầu file
  if (typeof window.appState === 'undefined') {
    window.appState = {
      userSession: null,
      appInitialized: false,
      isDataLoaded: false,
      loadingActive: false,
      metrics: null,
      reports: [],
      teamData: [],
      notifications: { reports: [], unreadCount: 0 },
      trackingRosters: { reports: [] },
      trackingIncidents: [],
      logistics: { items: [], logs: [], activeIncidents: [] },
      map: null,
      mapInitialized: false,
      geojsonBaseLayer: null,
      choroplethLayer: null,
      markersLayerGroup: null,
      mapGeoData: null,
      mapCompanyData: [],
      filteredData: [],
      drawnItems: null, // (MỚI) Lưu các hình vẽ thêm vào
      selectedRangeChecker: null, // Lưu trạng thái lọc theo màu legend
    };
    console.log('[APP INIT] window.appState initialized with defaults.');
  } else {
    console.log('[APP INIT] window.appState already exists.');
  }
  // ========================================================================
  // BẢO VỆ TOÀN CỤC: TỰ ĐỘNG TẮT LOADING KHI CÓ LỖI CHÍNH MẠNG
  // ========================================================================
  // ========================================================================
  // HỆ THỐNG AUTO-LOGIN & KIỂM TRA SESSION KHI VỪA VÀO TRANG (F5)
  // ========================================================================
  document.addEventListener('DOMContentLoaded', async function () {
    // Chỉ chạy chức năng này nếu đã khai báo Supabase thành công
    if (window.supabaseClient) {
      console.log('🔄 Đang kiểm tra vé vào cổng (Session)...');

      // 1. Thò tay vào túi quần (localStorage) lấy Session
      const {
        data: { session },
        error,
      } = await window.supabaseClient.auth.getSession();

      if (session && !error) {
        console.log('✅ Tìm thấy vé! Tự động đưa vào Dashboard...');
        // Ép hệ thống chạy thẳng hàm mở Dashboard
        if (typeof window.enterDashboard === 'function') {
          window.enterDashboard();
        }
      } else {
        console.log('⚠️ Không có vé hoặc vé hết hạn. Ở lại trang Login.');
        // Đảm bảo mở đúng giao diện Login (Thay 'view-login' bằng id của bạn nếu cần)
        if (typeof window.go === 'function') {
          window.go('login'); // Nhớ dùng đúng cái ID mà lúc nãy bạn vừa sửa cho hết trắng màn hình nhé
        }
      }

      // 2. Lắng nghe mọi động tĩnh (Phòng trường hợp Token hết hạn giữa chừng)
      window.supabaseClient.auth.onAuthStateChange((event, currentSession) => {
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED_FAILED') {
          console.log('🚪 Đã đăng xuất hoặc Token hỏng, quay về Login.');
          window.userSession = null;
          if (typeof window.go === 'function') {
            window.go('login'); // Về lại form đăng nhập
          }
        }
      });
    }
  });
  const emergencyStopLoading = () => {
    if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    if (typeof customShowLoading === 'function') customShowLoading(false);
    // ✅ FIX: thêm #global-loading-overlay và #global-loading-spinner vào danh sách.
    // Đây là 2 overlay trắng toàn màn hình ("Đang tải dữ liệu...") nhưng KHÔNG có
    // bất kỳ đoạn JS nào trong file này từng ẩn chúng đi -> khi có lỗi xảy ra giữa
    // lúc khởi động, mọi spinner khác được dọn sạch nhưng 2 overlay này bị bỏ quên,
    // đứng che kín màn hình mãi (đây chính là hiện tượng "trắng bóc" sau khi F5).
    document
      .querySelectorAll(
        '.loading, #loading-spinner, .spinner-container, #global-loading-overlay, #global-loading-spinner'
      )
      .forEach((el) => {
        el.style.display = 'none';
      });
  };

  // ✅ FIX: Lưới an toàn cuối cùng - dù mọi thứ khác có lỗi gì cũng không bắt được,
  // sau 12 giây overlay loading toàn cục PHẢI biến mất, không được đứng mãi.
  setTimeout(() => {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay && overlay.style.display !== 'none') {
      console.warn('⏱️ Timeout an toàn: tự ẩn global-loading-overlay sau 12s');
      overlay.style.display = 'none';
    }
  }, 12000);

  window.addEventListener('error', function (event) {
    console.error('🔥 Bắt được lỗi toàn cục (Syntax/Reference):', event.error);
    emergencyStopLoading();
  });

  window.addEventListener('unhandledrejection', function (event) {
    console.error('🔥 Bắt được lỗi Promise (Network/Supabase):', event.reason);
    emergencyStopLoading();
  });
  // ✅ Kiểm tra SDK đã load chưa
  if (typeof window.supabase?.createClient !== 'function') {
    console.warn('⏳ Supabase SDK not loaded, waiting...');

    // Đợi SDK load với retry
    const maxRetries = 50; // 50 x 100ms = 5s
    let retries = 0;

    const retryInit = () => {
      if (typeof window.supabase?.createClient === 'function') {
        doInit();
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(retryInit, 100);
      } else {
        console.error('❌ Supabase SDK failed to load after 5s');
      }
    };
    retryInit();
    return;
  }

  doInit();

  function doInit() {
    try {
      // ✅ Tạo client với config rõ ràng để tránh conflict
      window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          auth: {
            // ✅ Dùng storage key duy nhất cho app của bạn
            storageKey: 'your-app-name-auth-token',
            // ✅ Tự động refresh token
            autoRefreshToken: true,
            // ✅ Persist session giữa các tab
            persistSession: true,
            // ✅ Detect session trong các tab khác
            detectSessionInUrl: true,
          },
          // ✅ Optional: Global fetch với timeout
          global: {
            fetch: (url, options = {}) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
              return fetch(url, {
                ...options,
                signal: controller.signal,
              }).finally(() => clearTimeout(timeout));
            },
          },
        }
      );

      console.log('✅ Supabase singleton initialized:', {
        url: SUPABASE_URL.replace(/\/\/[^.]+/, '//***'),
        key: SUPABASE_ANON_KEY.substring(0, 10) + '...',
      });

      // ✅ Listen auth changes để debug
      window.supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email);
      });

      // ✅ Trigger event để các module khác biết client đã ready
      document.dispatchEvent(
        new CustomEvent('supabase:ready', {
          detail: { client: window.supabaseClient },
        })
      );

      return window.supabaseClient;
    } catch (err) {
      console.error('❌ Failed to init Supabase singleton:', err);
    }
  }
})();
// Tạo Manifest động
var manifest = {
  name: 'HCDC RRT System',
  short_name: 'RRT HCDC',
  start_url: window.location.href,
  display: 'standalone',
  background_color: '#ffffff',

  /* 👇 ĐỔI MÀU Ở ĐÂY NỮA (Để khi cài App vào máy nó không hiện theme xanh) */
  theme_color: '#ffffff',

  icons: [
    {
      src: 'https://github.com/hcdc-ap/images-host/blob/main/images/productivity.png?raw=true',
      sizes: '192x192',
      type: 'image/png',
    },
  ],
};
var stringManifest = JSON.stringify(manifest);
var blob = new Blob([stringManifest], { type: 'application/json' });
var manifestURL = URL.createObjectURL(blob);
document
  .querySelector('#my-manifest-placeholder')
  .setAttribute('href', manifestURL);

const webAppUrl = '<?!= getWebAppUrl() ?>'; // (Ghi chú: dòng này của GAS, ở StackBlitz bạn có thể để trống const webAppUrl = '';)
/* =========================
     SPA ROUTER
  ========================= */
window.go = function (view) {
  // ✅ FIX: Ngay khi đã quyết định được view nào sẽ hiển thị (login hay dashboard),
  // ẩn luôn overlay "Đang tải dữ liệu..." ban đầu. Việc tải dữ liệu CHI TIẾT bên
  // trong dashboard (nếu có) sẽ dùng spinner riêng của customShowLoading(),
  // không liên quan tới overlay này nữa.
  const globalOverlay = document.getElementById('global-loading-overlay');
  if (globalOverlay) globalOverlay.style.display = 'none';

  $('.app-view').removeClass('active');
  $('#view-' + view).addClass('active');

  if (view === 'login') {
    setTimeout(() => {
      if (typeof resetLoginUI === 'function') resetLoginUI();
      if (typeof extraThemes === 'function') extraThemes();
      if (typeof restoreLoginTheme === 'function') restoreLoginTheme();
    }, 0);
  } else if (view === 'datatable') {
    // ✅ CHỐNG LỖI DATATABLE KHÔNG LOAD DỮ LIỆU KHI BỊ ẨN
    setTimeout(() => {
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Ép DataTable tính toán lại kích thước hiển thị
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable.isDataTable('#rrt-table')
      ) {
        $('#rrt-table').DataTable().columns.adjust().draw();
      }
    }, 150); // Đợi 150ms cho CSS Transition kịp chạy xong
  }
};
// ========================================================================
// 3. LẮNG NGHE TRẠNG THÁI ĐĂNG NHẬP (AUTH LISTENER)
// ========================================================================
document.addEventListener('supabase:ready', function ({ detail }) {
  const client = detail.client;

  client.auth.onAuthStateChange(async (event, session) => {
    console.log(`🛡️ Auth state changed: ${event}`, session);

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      if (session) {
        console.log('🔐 Session detected, initializing user context...');
        window.supabaseSession = session;

        // GỌI loadUserProfile để đảm bảo có profile
        const profileLoaded = await window.loadUserProfile();

        if (profileLoaded) {
          console.log('✅ User profile loaded, applying permissions...');
          // Áp dụng phân quyền ngay lập tức
          if (typeof applyRolePermissions === 'function') {
            applyRolePermissions(window.userSession.role);
          }
          // GỌI HÀM ĐỂ XỬ LÝ VIỆC ĐIỀU HƯỚNG SAU KHI CÓ SESSION
          // Điều này tách rời logic điều hướng khỏi onAuthStateChange
          window.handleSuccessfulAuth();
        } else {
          console.error(
            '❌ Profile could not be loaded after successful sign-in.'
          );
          // Có thể cần logout nếu profile không tồn tại
          // await window.supabaseClient.auth.signOut();
          // window.go('login');
        }
      } else {
        console.log('🔒 No session found in INITIAL_SESSION/SIGNED_IN.');
        // Nếu không có session, có thể cần điều hướng về login
        // Tuy nhiên, thường INITIAL_SESSION không có session là bình thường nếu chưa đăng nhập trước đó.
        // Logic điều hướng về login nên được xử lý riêng nếu cần.
      }
    } else if (event === 'SIGNED_OUT') {
      console.log('🚪 User signed out, cleaning up...');
      window.userSession = null;
      window.supabaseSession = null;
      localStorage.removeItem('userSession');
      // Reset app state
      if (window.appState) {
        window.appState.users = [];
        window.appState.incidents = [];
        window.appState.appInitialized = false; // Quan trọng: Reset flag
        window.appState.isDataLoaded = false;
        // Reset các state khác nếu cần
      }

      // DỌN DẸP SẠCH CACHE ĐỂ ĐÓN USER MỚI
      if (typeof QueryCache !== 'undefined' && QueryCache.cache) {
        QueryCache.cache.clear();
      }

      // Điều hướng về login
      if (typeof window.go === 'function') window.go('login');
    }
  });
}); // ← Đóng document.addEventListener
// --- BƯỚC 3: Thêm hàm handleSuccessfulAuth ---
// Hàm này xử lý điều hướng và khởi tạo app sau khi xác thực thành công
window.handleSuccessfulAuth = function () {
  console.log('🚀 Handling successful authentication...');
  if (typeof window.go === 'function') {
    console.log('   -> Navigating to dashboard...');
    window.go('dashboard');
  }
  if (typeof window.enterDashboard === 'function') {
    console.log('   -> Entering dashboard...');
    window.enterDashboard(); // Gọi không await để không block event handler
  }
};
// --- KẾT THÚC handleSuccessfulAuth ---
// ========================================================================
// REALTIME MANAGER - QUẢN LÝ KẾT NỐI REALTIME
// ========================================================================
window.RealtimeManager = {
  subscriptions: {
    incidents: null,
    rosterAssignments: null,
  },

  isActive: false,

  start() {
    if (!window.userSession || this.isActive) {
      console.log('ℹ️ Realtime sync skipped - no session or already active');
      return;
    }

    console.log('🟢 Starting Supabase Realtime sync...');
    this.isActive = true;

    // 1. Subscribe to Incidents table
    if (!this.subscriptions.incidents) {
      this.subscriptions.incidents = window.supabaseClient
        .channel('public:incidents')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'incidents' },
          (payload) => {
            console.log('⚡ Realtime: Incidents updated', payload);
            // Refresh dashboard khi có thay đổi
            if (typeof window.enterDashboard === 'function') {
              window.enterDashboard();
            }
          }
        )
        .subscribe();
    }

    // 2. Subscribe to Roster Assignments table
    if (!this.subscriptions.rosterAssignments) {
      this.subscriptions.rosterAssignments = window.supabaseClient
        .channel('public:roster_assignments')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'roster_assignments' },
          (payload) => {
            console.log('⚡ Realtime: Roster Assignments updated', payload);
            // Refresh dashboard khi có thay đổi
            if (typeof window.enterDashboard === 'function') {
              window.enterDashboard();
            }
          }
        )
        .subscribe();
    }
  },

  stop() {
    console.log('🛑 Stopping Supabase Realtime sync...');
    this.isActive = false;

    // Unsubscribe from all channels
    Object.values(this.subscriptions).forEach((subscription) => {
      if (subscription) {
        window.supabaseClient.removeChannel(subscription);
      }
    });

    this.subscriptions = {
      incidents: null,
      rosterAssignments: null,
    };

    console.log('✅ Realtime sync stopped');
  },
};
// ========================================================================
// ON INITIAL DATA SUCCESS (CALLBACK)
// ========================================================================
window.onInitialDataSuccess = function (appStateData) {
  if (!appStateData) {
    console.error('❌ Dữ liệu truyền vào hàm render bị trống.');
    return;
  }

  console.log('✅ Bắt đầu Render giao diện với dữ liệu:', appStateData);

  // Gán dữ liệu vào appState toàn cục
  window.appState = {
    ...window.appState,
    ...appStateData,
    isDataLoaded: true,
  };

  window.departmentMap = window.appState.departmentMap || {};

  // Cập nhật giao diện phụ thuộc
  if (typeof createWardDropdown === 'function') {
    createWardDropdown();
  }

  // Vẽ lại giao diện
  if (typeof window.renderDashboard === 'function') {
    window.renderDashboard();
  }

  if (typeof window.renderRRTTable === 'function') {
    window.renderRRTTable();
  }

  // Áp dụng bộ lọc nếu có
  const startDate = $('#filter-date-start').val();
  const endDate = $('#filter-date-end').val();
  if ((startDate || endDate) && typeof applyDateFilter === 'function') {
    console.log('🔄 Đang áp dụng lại bộ lọc ngày...');
    applyDateFilter(startDate, endDate);
  }

  // Kiểm tra quyền Admin để hiện nút xuất báo cáo
  if (window.userSession && window.userSession.role?.includes('admin')) {
    $('#btn-export-members').show();
    $('#btn-export-logistics').show();
  }

  // Hoàn tất
  if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
};

// ========================================================================
// HELPER: LỌC DỮ LIỆU THEO ROLE (User/Admin)
// ========================================================================
window.filterDataByRole = function (dataArray) {
  if (!Array.isArray(dataArray)) return [];

  const userRole = (window.userSession?.role || '').toLowerCase();
  const userId = window.userSession?.id || window.userSession?.user?.id;
  const userEmail = window.userSession?.email;

  // ✅ ADMIN: Xem tất cả
  if (userRole === 'admin') {
    return dataArray;
  }

  // ✅ USER: Chỉ xem dữ liệu của chính mình
  return dataArray.filter((item) => {
    // Kiểm tra khớp theo ID, Email hoặc created_by
    return (
      item.id === userId ||
      item.user_id === userId ||
      item.email === userEmail ||
      item.created_by === userId
    );
  });
};
// ========================================================================
// ENTER DASHBOARD - BỌC THÉP VÀ CHUẨN HÓA PHÂN QUYỀN
// ========================================================================
// ========================================================================
// ENTER DASHBOARD - BỌC THÉP VÀ CHUẨN HÓA PHÂN QUYỀN
// ========================================================================
window.enterDashboard = async function () {
  console.log('➡️ enterDashboard called');

  // ✅ 1. Load user profile nếu chưa có session
  if (!window.userSession?.id) {
    console.log('🔄 Loading user profile...');
    const loaded = await window.loadUserProfile();
    if (!loaded) {
      console.warn('⚠️ Không có session hợp lệ, yêu cầu đăng nhập.');
      if (typeof window.go === 'function') window.go('login');
      return;
    }
  }

  // Khai báo các biến an toàn để sử dụng trong Batch Fetch
  const currentUserId = window.userSession?.id;
  const currentUserRole = (window.userSession?.role || 'user')
    .toLowerCase()
    .trim();
  const isAdmin = currentUserRole === 'admin';

  // ✅ 2. PHÂN QUYỀN UI NGAY LẬP TỨC TRƯỚC KHI TẢI DỮ LIỆU
  if (typeof window.applyRolePermissions === 'function') {
    window.applyRolePermissions(currentUserRole);
  }
  // 🔥 THÊM ĐOẠN NÀY VÀO: ĐỔI TÊN NGƯỜI DÙNG TRÊN MENU 🔥
  const userNameSpan = document.getElementById('display-user-fullname');
  if (userNameSpan && window.userSession?.full_name) {
    // Bắn tên từ Database vào thẻ HTML
    userNameSpan.textContent = window.userSession.full_name;
  }
  // ✅ 3. Tránh load nhiều lần
  if (window.appState?.appInitialized) {
    console.log('⏭️ Dashboard already initialized');
    return;
  }
  window.appState.appInitialized = true;

  // ✅ 4. Show loading
  if (typeof customShowLoading === 'function') customShowLoading(true);

  try {
    // ✅ 5. Load data với BATCH FETCH + CACHE
    console.log('📦 Batch fetching dashboard data...');

    const [
      profilesRes,
      incidentsRes,
      trainingRes,
      deploymentRes,
      notificationsRes,
    ] = await batchFetch([
      // Profiles - LỌC THEO ROLE
      () =>
        QueryCache.fetch(`profiles:${currentUserRole}`, async () => {
          let query = window.supabaseClient
            .from('profiles')
            .select(
              'id, email, full_name, role, team, position, deployment_status, approval_status'
            );

          // FIX: User thường chỉ lấy profile của chính mình
          if (!isAdmin && currentUserId) {
            query = query.eq('id', currentUserId);
          }
          const { data, error } = await query;
          if (error) throw error;
          return data;
        }),

      // Incidents - chỉ lấy active, cache 2 phút
      () =>
        QueryCache.fetch('incidents:active', async () => {
          const { data, error } = await window.supabaseClient
            .from('incidents')
            .select(
              'id, event_name, status, location_text, activation_time, members, declined_members, confirmations'
            )
            .eq('status', 'active');
          if (error) throw error;
          return data;
        }),

      // Training courses - cache 10 phút
      () =>
        QueryCache.fetch('training:all', async () => {
          const { data, error } = await window.supabaseClient
            .from('training_courses')
            .select('id, course_name, training_date, location, status');
          if (error) throw error;
          return data;
        }),

      // Deployment history - gần nhất 50 bản ghi, cache 3 phút
      () =>
        QueryCache.fetch('deployments:recent', async () => {
          const { data, error } = await window.supabaseClient
            .from('deployment_history')
            .select('id, incident_id, user_id, action_type, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
          if (error) throw error;
          return data;
        }),

      // Notifications cho user hiện tại - không cache (luôn tươi)
      async () => {
        const userEmail = window.userSession?.email;
        if (!userEmail) return [];
        const { data, error } = await window.supabaseClient
          .from('notifications')
          .select('id, message, is_read, created_at, notification_type')
          .eq('user_email', userEmail)
          .eq('is_read', false)
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        return data;
      },
    ]);

    // ✅ 6. Lưu vào appState
    window.appState = window.appState || {};
    window.appState.users = profilesRes || [];
    window.appState.incidents = incidentsRes || [];
    window.appState.training_courses = trainingRes || [];
    window.appState.deployment_history = deploymentRes || [];
    window.appState.notifications_list = notificationsRes || [];

    // ✅ 7. Gọi callback nếu có
    if (typeof window.onInitialDataSuccess === 'function') {
      window.onInitialDataSuccess(window.appState);
    }

    // ✅ 8. Render các component chính và MỞ TAB MẶC ĐỊNH
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
    if (typeof window.renderRRTTable === 'function') {
      window.renderRRTTable();
    }

    // 🔥 ĐOẠN CODE CHỐNG TRẮNG MÀN HÌNH (ĐẶT ĐÚNG CHỖ RỒI NHÉ) 🔥
    setTimeout(() => {
      // Chắc chắn rằng giao diện tổng Dashboard đã được bật
      if (typeof window.go === 'function') {
        window.go('dashboard');
      }

      // Tìm đúng cái nút Menu RRT trong file HTML và bấm mở nội dung
      const defaultMenu = document.getElementById('menu-dashboard');
      if (defaultMenu) {
        defaultMenu.click();
      } else {
        console.warn('⚠️ Không tìm thấy nút #menu-rrt trong HTML');
      }
    }, 150);

    // ✅ 9. START REALTIME SYNC (sau khi load xong)
    if (
      window.RealtimeManager &&
      typeof window.RealtimeManager.start === 'function'
    ) {
      window.RealtimeManager.start();
    }
  } catch (error) {
    // -----------------------------------------------------
    // XỬ LÝ LỖI (ĐÃ TẮT TÍNH NĂNG VĂNG RA LOGIN)
    // -----------------------------------------------------
    console.error('❌ Lỗi khởi tạo Dashboard (Đã tắt auto-kick):', error);

    if (typeof showToast === 'function') {
      showToast(
        'Có lỗi khi vẽ dữ liệu! Vui lòng nhấn F12 để kiểm tra.',
        'error'
      );
    } else {
      alert('Có lỗi khi vẽ dữ liệu! Vui lòng nhấn F12 để kiểm tra.');
    }
  } finally {
    if (typeof customShowLoading === 'function') customShowLoading(false);
  }
};
// ========================================================================
// LOGOUT - CLEANUP REALTIME + SESSION
// ========================================================================
window.logout = async function () {
  console.log('👋 Logging out...');

  // ✅ 1. Stop Realtime subscriptions TRƯỚC
  window.RealtimeManager.stop();

  // ✅ 2. Clear local state
  window.userSession = null;
  if (window.appState) {
    window.appState.appInitialized = false;
    window.appState.users = [];
    window.appState.incidents = [];
  }

  // ✅ 3. Clear localStorage
  localStorage.removeItem('userSession');

  // ✅ 4. Sign out từ Supabase
  try {
    await window.supabaseClient.auth.signOut();
    console.log('✅ Supabase session cleared');
  } catch (err) {
    console.error('⚠️ Error signing out:', err);
  }

  // ✅ 5. Reset app state nếu có hàm
  if (typeof window.resetAppState === 'function') {
    window.resetAppState();
  }

  // ✅ 6. Redirect về login
  if (typeof window.go === 'function') {
    window.go('login');
  } else {
    window.location.href = '/login.html';
  }
};
// ========================================================================
// RESET APP STATE
// ========================================================================
window.resetAppState = function () {
  if (!window.appState) return;

  window.appState.appInitialized = false;
  window.appState.isDataLoaded = {
    reports: false,
    analytics: false,
    dashboard: false,
    team: false,
    notification: false,
  };

  // Reset map
  window.appState.map = null;
  window.appState.geojsonBaseLayer = null;
  window.appState.choroplethLayer = null;
  window.appState.markersLayerGroup = null;
  window.appState.mapGeojsonData = null;
  window.appState.mapCompanyData = [];
  window.appState.filteredData = [];

  console.log('✅ appState reset');
};
// ========================================================================
// APP BOOTSTRAP - KHỞI ĐỘNG ỨNG DỤNG
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 App starting...');

  // ✅ FIX: KHÔNG tự gọi window.go('dashboard') + enterDashboard() ở đây nữa.
  // Trước đây có 3 nơi cùng làm việc này mỗi khi F5 (ở đây, ở onAuthStateChange,
  // và ở $(document).ready phía dưới) -> chạy đua nhau, tải dữ liệu trùng lặp,
  // và là nguyên nhân chính gây kẹt màn hình trắng "Đang tải dữ liệu...".
  //
  // window.supabaseClient.auth.onAuthStateChange (sự kiện INITIAL_SESSION) giờ là
  // nơi DUY NHẤT quyết định vào dashboard hay về login, vì nó hỏi trực tiếp
  // Supabase - đáng tin cậy hơn cache 'userSession' trong localStorage (có thể cũ
  // hoặc sai). Ở đây chỉ giữ lại phần hiện hướng dẫn cài đặt PWA khi chưa từng
  // đăng nhập trên máy này.
  if (
    !localStorage.getItem('userSession') &&
    typeof checkInstallGuide === 'function'
  ) {
    checkInstallGuide();
  }
});
/* =========================
     INSTALL GUIDE
  ========================= */
function checkInstallGuide() {
  if (localStorage.getItem('hasShownInstallGuide')) return;

  setTimeout(() => {
    if (typeof showInstallGuide === 'function') showInstallGuide();
    localStorage.setItem('hasShownInstallGuide', 'true');
  }, 1500);
}
window.showInstallGuide = function () {
  const ua = navigator.userAgent.toLowerCase();
  $('#guide-ios, #guide-android, #guide-pc').hide();

  if (/iphone|ipad/.test(ua)) $('#guide-ios').show();
  else if (/android/.test(ua)) $('#guide-android').show();
  else $('#guide-pc').show();

  const modal = new bootstrap.Modal('#modal-install-pwa');
  modal.show();
};
document.addEventListener('DOMContentLoaded', function () {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return;

  /* =========================
       1. Auto-fill Remember Me
    ========================== */
  const savedUsername = localStorage.getItem('rememberUsername');
  const savedPassword = localStorage.getItem('rememberPassword');

  if (savedUsername && savedPassword) {
    document.getElementById('login-user').value = savedUsername;
    document.getElementById('login-password').value = savedPassword;
    document.getElementById('remember-me')?.setAttribute('checked', true);
  }

  /* =========================
       2. Submit Login (Giữ nguyên phần gọi Supabase đã sửa ở bước trước)
    ========================== */
  // Thay thế toàn bộ phần loginForm.onsubmit bằng code này:
  loginForm.onsubmit = async function (e) {
    e.preventDefault();

    if (typeof showLoading === 'function') showLoading(true);

    const email = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me');

    if (!email || !password) {
      if (typeof showToast === 'function')
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
      if (typeof showLoading === 'function') showLoading(false);
      return;
    }

    // Lưu remember nếu cần
    if (remember?.checked) {
      localStorage.setItem('rememberEmail', email);
      localStorage.setItem('rememberPassword', password);
    } else {
      localStorage.removeItem('rememberEmail');
      localStorage.removeItem('rememberPassword');
    }

    try {
      console.log('🔐 Đang đăng nhập với Supabase...');
      await window.supabaseClient.auth.signOut();

      const { data: authData, error: authError } =
        await window.supabaseClient.auth.signInWithPassword({
          email: email,
          password: password,
        });

      if (authError) {
        throw new Error(authError.message || 'Sai email hoặc mật khẩu!');
      }

      // 1. Tải Profile từ DB và lưu vào Session
      await window.loadUserProfile();

      // ✅ 2. ÉP PHÂN QUYỀN NGAY LẬP TỨC bằng profile vừa tải trước khi mở cửa
      if (window.userSession && typeof applyRolePermissions === 'function') {
        applyRolePermissions(window.userSession.role);
      }

      // 3. Show success + chuyển trang
      if (typeof showToast === 'function')
        showToast('Đăng nhập thành công!', 'success');

      if (typeof window.go === 'function') {
        window.go('dashboard');
      }

      if (typeof window.enterDashboard === 'function') {
        await window.enterDashboard();
      }
    } catch (err) {
      console.error('❌ Lỗi đăng nhập:', err);
      if (typeof showToast === 'function') {
        showToast(err.message || 'Lỗi kết nối máy chủ!', 'error');
      }
    } finally {
      if (typeof showLoading === 'function') showLoading(false);
    }
  };
});
// ======================
// KHỞI TẠO BIẾN DOM
// ======================
const slider = document.getElementById('slider'),
  container = document.getElementById('container'),
  right = document.getElementById('right'),
  login = document.getElementById('login'),
  recover = document.getElementById('recover'),
  otpReset = document.getElementById('otp-reset'),
  forgotPassButton = document.getElementById('forgot-pass'),
  backToLoginButton = document.getElementById('back-to-login'),
  newAccountButton = document.getElementById('new-account'),
  signupSlideButton = document.getElementById('signup-slide-button'),
  loginSlideButton = document.getElementById('login-slide-button'),
  password = document.getElementById('signup-password'),
  passwordConfirmation = document.getElementById('signup-confirm-password'),
  passwordLabel = document.getElementById('password-label'),
  passwordConfirmationLabel = document.getElementById('confirm-password-label'),
  passwordRequirementsContainer = document.getElementById(
    'password-requirements-container'
  ),
  passwordRequirements = document.getElementById('password-requirements'),
  passwordRequirementsLength = document.getElementById(
    'password-requirements-length'
  ),
  passwordRequirementsNumber = document.getElementById(
    'password-requirements-number'
  ),
  passwordRequirementsLower = document.getElementById(
    'password-requirements-lower'
  ),
  passwordRequirementsUpper = document.getElementById(
    'password-requirements-upper'
  ),
  passwordRequirementsSpecial = document.getElementById(
    'password-requirements-special'
  ),
  forms = document.querySelectorAll('form'),
  inputs = document.querySelectorAll('.input'),
  passwordInputs = document.querySelectorAll('input[type="password"]'),
  validationIcons = document.querySelectorAll('.validation-icon'),
  labelWrappers = document.querySelectorAll('.label-wrapper'),
  labels = document.querySelectorAll('.label'),
  passwordEyes = document.querySelectorAll('.password-eye'),
  checkboxes = document.querySelectorAll('input[type="checkbox"]'),
  checkmarkLabels = document.querySelectorAll('.checkmark-label'),
  radios = document.querySelectorAll('input[type="radio"]'),
  radioButtonLabels = document.querySelectorAll('.radio-label');

// ======================
// REGEX VALIDATION
// ======================
const validMail = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
const validPassword =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d\s]).{8,32}$/;

// ======================
// HÀM CHUYỂN FORM DUY NHẤT
// ======================
function showSection(sectionId) {
  const formIds = ['login', 'recover', 'otp-reset'];
  formIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (id === sectionId) {
        el.classList.add('active');
        el.style.display = '';
      } else {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    }
  });
}
// ======================
// CHUYỂN SLIDE VÀ FORM ĐĂNG NHẬP/ĐĂNG KÝ/QUÊN MẬT KHẨU
// ======================
function sliding() {
  if (signupSlideButton) {
    signupSlideButton.onclick = () => {
      slider.classList.add('slide');
      container.classList.add('slide');
      right.classList.add('active');
    };
  }

  if (loginSlideButton)
    loginSlideButton.onclick = () => {
      slider.classList.remove('slide');
      container.classList.remove('slide');
      right.classList.remove('active');
    };
  if (forgotPassButton) forgotPassButton.onclick = () => showSection('recover');
  if (backToLoginButton) backToLoginButton.onclick = () => showSection('login');
  if (newAccountButton)
    newAccountButton.onclick = () => {
      slider.classList.add('slide');
      container.classList.add('slide');
      setTimeout(() => {
        right.classList.add('active');
        showSection('login');
      }, 900);
    };
}
// ======================
// HIỆU ỨNG INPUT
// ======================
function inputStyling() {
  for (let i = 0; i < inputs.length; i++) {
    let elements = [inputs[i], labelWrappers[i], labels[i]];
    let values = new Array(inputs.length);
    let states = new Array(inputs.length);
    // Hover
    inputs[i].onmouseover = () => {
      elements.forEach((elm) => elm && elm.classList.add('hover'));
      inputs[i].nextElementSibling?.classList.add('hover');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.add('hover');
    };
    inputs[i].onmouseout = () => {
      elements.forEach((elm) => elm && elm.classList.remove('hover'));
      inputs[i].nextElementSibling?.classList.remove('hover');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.remove(
          'hover'
        );
    };
    // Focus
    inputs[i].onfocus = () => {
      if (inputs[i].classList.contains('valid')) states[i] = 'valid';
      else if (inputs[i].classList.contains('invalid')) states[i] = 'invalid';
      else states[i] = null;
      validationStyling('focused', inputs[i], labels[i], i);
      elements.forEach((elm) => elm && elm.classList.add('active'));
      inputs[i].nextElementSibling?.classList.add('active');
      if (inputs[i].nextElementSibling?.nextElementSibling)
        inputs[i].nextElementSibling.nextElementSibling.classList.add('active');
      if (inputs[i] == password)
        passwordRequirementsContainer &&
          passwordRequirementsContainer.classList.add('active');
      passwordRequirements && passwordRequirements.classList.add('active');
      if (inputs[i].value !== '') values[i] = inputs[i].value;
      else values[i] = null;
    };
    // Blur
    inputs[i].onblur = () => {
      if (inputs[i].value === '') {
        elements.forEach((elm) => elm && elm.classList.remove('active'));
        inputs[i].nextElementSibling?.classList.remove('active');
        if (inputs[i].nextElementSibling?.nextElementSibling)
          inputs[i].nextElementSibling.nextElementSibling.classList.remove(
            'active'
          );
        if (inputs[i] == password) {
          Array.from(passwordRequirements?.children || []).forEach((elm) => {
            elm.classList.remove('valid');
            elm.classList.remove('invalid');
            elm.firstElementChild.classList.remove(
              'uil-check-circle',
              'uil-times-circle'
            );
            elm.firstElementChild.classList.add('uil-info-circle');
          });
        }
      } else if (states[i] && inputs[i].value == values[i]) {
        validationStyling(states[i], inputs[i], labels[i], i);
      }
      if (
        (inputs[i] == password || inputs[i] == passwordConfirmation) &&
        password &&
        passwordConfirmation &&
        password.value !== '' &&
        passwordConfirmation.value !== ''
      ) {
        if (confirmPassword())
          validationStyling(
            'valid',
            passwordConfirmation,
            passwordConfirmationLabel,
            5
          );
        else
          validationStyling(
            'invalid',
            passwordConfirmation,
            passwordConfirmationLabel,
            5
          );
      }
      if (inputs[i] == password) {
        passwordRequirementsContainer &&
          passwordRequirementsContainer.classList.remove('active');
        passwordRequirements && passwordRequirements.classList.remove('active');
        Array.from(passwordRequirements?.children || []).forEach((elm) => {
          if (!elm.classList.contains('valid') && password.value !== '') {
            elm.classList.add('invalid');
            elm.firstElementChild.classList.remove('uil-info-circle');
            elm.firstElementChild.classList.add('uil-times-circle');
          }
        });
      }
    };
  }
}
// ======================
// HIỆU ỨNG MẮT PASSWORD
// ======================
function passwordVisibility() {
  for (let i = 0; i < passwordEyes.length; i++) {
    passwordEyes[i].onclick = function () {
      if (passwordInputs[i].type === 'password') {
        passwordInputs[i].type = 'text';
        this.classList.add('visible');
        this.lastElementChild &&
          (this.lastElementChild.attributes['data-tooltip'].value =
            'hide password');
      } else {
        passwordInputs[i].type = 'password';
        this.classList.remove('visible');
        this.lastElementChild &&
          (this.lastElementChild.attributes['data-tooltip'].value =
            'show password');
      }
    };
  }
}
// ======================
// VALIDATION UI ĐÚNG/SAI/FOCUS/EMPTY
// ======================
function validationStyling(type, input, label, iconIndex) {
  iconIndex *= 2;
  let eyeIndex = Array.from(passwordInputs).indexOf(input);
  if (eyeIndex === -1) eyeIndex = null;
  if (type == 'valid') {
    input.classList.remove('invalid');
    input.classList.add('valid');
    input.nextElementSibling.classList.remove('invalid');
    input.nextElementSibling.classList.add('valid');
    label.classList.remove('invalid');
    label.classList.add('valid');
    validationIcons[iconIndex + 1]?.classList.remove('active');
    validationIcons[iconIndex]?.classList.add('active');
    if (eyeIndex !== null) passwordEyes[eyeIndex].classList.add('valid');
  } else if (type == 'invalid') {
    input.classList.remove('valid');
    input.classList.add('invalid');
    label.classList.remove('valid');
    label.classList.add('invalid');
    input.nextElementSibling.classList.remove('valid');
    input.nextElementSibling.classList.add('invalid');
    validationIcons[iconIndex]?.classList.remove('active');
    validationIcons[iconIndex + 1]?.classList.add('active');
    if (eyeIndex !== null) passwordEyes[eyeIndex].classList.add('invalid');
  } else if (type == 'empty' || type == 'focused') {
    input.classList.remove('valid', 'invalid');
    label.classList.remove('valid', 'invalid');
    input.nextElementSibling.classList.remove('valid', 'invalid');
    validationIcons[iconIndex]?.classList.remove('active');
    validationIcons[iconIndex + 1]?.classList.remove('active');
    if (eyeIndex !== null)
      passwordEyes[eyeIndex].classList.remove('valid', 'invalid');
  }
  if (input == password && passwordConfirmation && passwordConfirmationLabel)
    validationStyling(
      'focused',
      passwordConfirmation,
      passwordConfirmationLabel,
      5
    );
}
// ======================
// CHECKBOX & RADIO
// ======================
function check() {
  for (let i = 0; i < checkmarkLabels.length; i++) {
    checkmarkLabels[i].onclick = () => {
      if (checkboxes[i]) checkboxes[i].checked = !checkboxes[i].checked;
    };
  }
  for (let i = 0; i < radioButtonLabels.length; i++) {
    radioButtonLabels[i].onclick = () => {
      if (radios[i]) radios[i].checked = true;
    };
  }
}
// ======================
// VALIDATE INPUT SIGNUP
// ======================
function inputValidation() {
  const inputArr = [
    {
      el: document.getElementById('signup-user'),
      label: document.getElementById('user-label'),
      type: 'username',
    },
    {
      el: document.getElementById('signup-company'),
      label: document.getElementById('company-label'),
      type: 'company',
    },
    {
      el: document.getElementById('signup-mail'),
      label: document.getElementById('mail-label'),
      type: 'mail',
    },
    {
      el: document.getElementById('signup-phone'),
      label: document.getElementById('phone-label'),
      type: 'phone',
    },
    {
      el: document.getElementById('signup-password'),
      label: document.getElementById('password-label'),
      type: 'password',
    },
    {
      el: document.getElementById('signup-confirm-password'),
      label: document.getElementById('confirm-password-label'),
      type: 'confirm-password',
    },
  ];
  inputArr.forEach((item, idx) => {
    if (!item.el) return;
    item.el.onchange = () => {
      let v = item.el.value.trim();
      if (item.type === 'username' || item.type === 'company') {
        if (v.length >= 3) validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'phone') {
        if (/^\d{8,15}$/.test(v.replace(/\D/g, '')))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'mail') {
        if (validMail.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'password') {
        if (validPassword.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'confirm-password') {
        const passwordEl = document.getElementById('signup-password');
        if (v === passwordEl.value && v.length > 0)
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      }
    };
  });

  const password = document.getElementById('signup-password');
  if (password)
    password.oninput = () => {
      let value = password.value;
      const valid = (req) => {
        if (!req.classList.contains('invalid'))
          req.firstElementChild.classList.remove('uil-info-circle');
        req.classList.remove('invalid');
        req.classList.add('valid');
        req.firstElementChild.classList.remove('uil-times-circle');
        req.firstElementChild.classList.add('uil-check-circle');
      };
      const invalid = (req) => {
        if (req.classList.contains('valid')) {
          req.classList.remove('valid');
          req.classList.add('invalid');
          req.firstElementChild.classList.remove('uil-check-circle');
          req.firstElementChild.classList.add('uil-times-circle');
        }
      };
      if (value.length >= 8 && value.length <= 32)
        valid(passwordRequirementsLength);
      else invalid(passwordRequirementsLength);
      if (/\d/.test(value)) valid(passwordRequirementsNumber);
      else invalid(passwordRequirementsNumber);
      if (/[a-z]/.test(value)) valid(passwordRequirementsLower);
      else invalid(passwordRequirementsLower);
      if (/[A-Z]/.test(value)) valid(passwordRequirementsUpper);
      else invalid(passwordRequirementsUpper);
      if (/[^a-zA-Z\d\s]/.test(value)) valid(passwordRequirementsSpecial);
      else invalid(passwordRequirementsSpecial);
    };
}
function confirmPassword() {
  return (
    password &&
    passwordConfirmation &&
    password.value == passwordConfirmation.value
  );
}
// ======================
// VALIDATE OTP INPUT UI
// ======================
function inputValidationOTP() {
  const inputArr = [
    {
      el: document.getElementById('otp-email'),
      label: document.querySelector('label[for="otp-email"]'),
      type: 'otp-mail',
    },
    {
      el: document.getElementById('otp-code'),
      label: document.querySelector('label[for="otp-code"]'),
      type: 'otp-code',
    },
    {
      el: document.getElementById('new-password'),
      label: document.querySelector('label[for="new-password"]'),
      type: 'otp-password',
    },
    {
      el: document.getElementById('new-confirm-password'),
      label: document.querySelector('label[for="new-confirm-password"]'),
      type: 'otp-confirm-password',
    },
  ];

  const otpPasswordRequirementsLength = document.getElementById(
    'otp-password-requirements-length'
  );
  const otpPasswordRequirementsNumber = document.getElementById(
    'otp-password-requirements-number'
  );
  const otpPasswordRequirementsLower = document.getElementById(
    'otp-password-requirements-lower'
  );
  const otpPasswordRequirementsUpper = document.getElementById(
    'otp-password-requirements-upper'
  );
  const otpPasswordRequirementsSpecial = document.getElementById(
    'otp-password-requirements-special'
  );

  inputArr.forEach((item, idx) => {
    if (!item.el) return;
    item.el.onchange = () => {
      let v = item.el.value.trim();
      if (item.type === 'otp-mail') {
        if (validMail.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'otp-code') {
        if (/^\d{6}$/.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'otp-password') {
        if (validPassword.test(v))
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      } else if (item.type === 'otp-confirm-password') {
        const passwordEl = document.getElementById('new-password');
        if (v === passwordEl.value && v.length > 0)
          validationStyling('valid', item.el, item.label, idx);
        else validationStyling('invalid', item.el, item.label, idx);
      }
    };
  });

  const otpPassword = document.getElementById('new-password');
  if (otpPassword) {
    otpPassword.onfocus = function () {
      document
        .getElementById('otp-password-requirements-container')
        .classList.add('active');
      document
        .getElementById('otp-password-requirements')
        .classList.add('active');
    };
    otpPassword.onblur = function () {
      if (!otpPassword.value) {
        document
          .getElementById('otp-password-requirements-container')
          .classList.remove('active');
        document
          .getElementById('otp-password-requirements')
          .classList.remove('active');
      }
    };
    otpPassword.oninput = () => {
      let value = otpPassword.value;
      const valid = (req) => {
        if (!req.classList.contains('invalid'))
          req.firstElementChild.classList.remove('uil-info-circle');
        req.classList.remove('invalid');
        req.classList.add('valid');
        req.firstElementChild.classList.remove('uil-times-circle');
        req.firstElementChild.classList.add('uil-check-circle');
      };
      const invalid = (req) => {
        if (req.classList.contains('valid')) {
          req.classList.remove('valid');
          req.classList.add('invalid');
          req.firstElementChild.classList.remove('uil-check-circle');
          req.firstElementChild.classList.add('uil-times-circle');
        }
      };
      if (value.length >= 8 && value.length <= 32)
        valid(otpPasswordRequirementsLength);
      else invalid(otpPasswordRequirementsLength);
      if (/\d/.test(value)) valid(otpPasswordRequirementsNumber);
      else invalid(otpPasswordRequirementsNumber);
      if (/[a-z]/.test(value)) valid(otpPasswordRequirementsLower);
      else invalid(otpPasswordRequirementsLower);
      if (/[A-Z]/.test(value)) valid(otpPasswordRequirementsUpper);
      else invalid(otpPasswordRequirementsUpper);
      if (/[^a-zA-Z\d\s]/.test(value)) valid(otpPasswordRequirementsSpecial);
      else invalid(otpPasswordRequirementsSpecial);
    };
  }
}
// ======================
// FORM SHAKING HIỆU ỨNG
// ======================
function sumbitForms() {
  forms.forEach((form) => {
    if (form.id === 'signup-form' || form.id === 'login-form') return;
    form.onsubmit = (e) => {
      let ok = true;
      form.querySelectorAll('.info').forEach((infoBox) => {
        let input = infoBox.querySelector('[required]');
        if (
          input &&
          (input.classList.contains('invalid') ||
            input.value == '' ||
            (input.type == 'checkbox' && !input.checked))
        ) {
          ok = false;
          infoBox.classList.add('invalid-submission');
          setTimeout(() => {
            infoBox.classList.remove('invalid-submission');
          }, 825);
        }
      });
      if (!ok) e.preventDefault();
    };
  });
}
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 500);
  }, duration);
}
function showLoading(show = true) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.toggle('active', show);
}
// ======================
// EXTRA THEMES (LOGIN ONLY)
// ======================
function extraThemes() {
  const loginView = document.getElementById('view-login');
  // Xóa bỏ "ổ khóa" bind 1 lần đi, thay bằng cơ chế gỡ event cũ trước khi gắn event mới
  if (!loginView) return;

  const openThemesButton = loginView.querySelector('#open-themes');
  const themes = loginView.querySelector('#themes');
  const themeLabels = loginView.querySelectorAll('.theme-label');
  const form = loginView.querySelector('#custom-theme-form');
  const closeThemesButton = loginView.querySelector('#close-themes');

  // ... (Khai báo các biến nút khác giữ nguyên) ...
  const clearCustomThemeBtn = loginView.querySelector('#clear-custom-theme');
  const ownTheme = loginView.querySelector('.own-theme');

  if (!openThemesButton || !themes || !form) return;

  // Dùng onclick trực tiếp sẽ tự động đè lên cái cũ, không sợ bị lặp sự kiện
  /* OPEN / CLOSE */
  openThemesButton.onclick = () => themes.classList.add('active');
  if (closeThemesButton)
    closeThemesButton.onclick = () => themes.classList.remove('active');

  // ... (Gắn sự kiện cho các nút khác giữ nguyên) ...

  if (clearCustomThemeBtn) {
    clearCustomThemeBtn.onclick = () => {
      loginView.removeAttribute('style');
      localStorage.removeItem('login_custom_theme');
    };
  }

  /* PRESET THEMES */
  themeLabels.forEach((label) => {
    label.onclick = () => {
      // 1. Lấy danh sách tất cả các ID của các nút Radio (sakura, winter, sunset...)
      const allThemeNames = Array.from(themeLabels).map((l) => l.htmlFor);

      // 2. Chỉ xóa những class nào nằm trong danh sách Theme, giữ nguyên các class nền tảng
      allThemeNames.forEach((themeName) => {
        loginView.classList.remove(themeName);
      });

      // 3. Thêm class của Theme mới được chọn
      loginView.classList.add(label.htmlFor);
      loginView.removeAttribute('style');

      // 4. Lưu lại cấu hình
      localStorage.setItem('login_theme', label.htmlFor);
      localStorage.removeItem('login_custom_theme');
    };
  });

  /* CUSTOM THEME */
  form.onsubmit = function (e) {
    e.preventDefault();

    let customTheme = '';
    const formdata = new FormData(form);

    loginView.removeAttribute('style');

    for (let [key, value] of formdata.entries()) {
      if (!value) continue;

      if (key === '--background-image') {
        customTheme += `${key}:url(${value});`;
      } else {
        customTheme += `${key}:${value};`;
      }

      if (key === '--body-color') {
        customTheme += `--body-color-gradient:${value}ec;`;
      }
    }

    loginView.setAttribute('style', customTheme);
    localStorage.setItem('login_custom_theme', customTheme);
    localStorage.removeItem('login_theme');
  };
}
function onLoginViewShown() {
  extraThemes();
  restoreLoginTheme();
}
// ======================
// MAIN ENTRYPOINT
// ======================
window.addEventListener('DOMContentLoaded', () => {
  sliding();
  inputStyling();
  passwordVisibility();
  check();
  inputValidation();
  sumbitForms();

  // ------- ĐĂNG KÝ (Đã chuyển sang Supabase) -------
  var signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.onsubmit = async function (e) {
      e.preventDefault();
      showLoading(true);
      const usernameInput = document.getElementById('signup-user');
      const companyInput = document.getElementById('signup-company');
      const emailInput = document.getElementById('signup-mail');
      const phoneInput = document.getElementById('signup-phone');
      const passwordInput = document.getElementById('signup-password');
      const confirmPasswordInput = document.getElementById(
        'signup-confirm-password'
      );
      const tosCheckbox = document.getElementById('tos');
      if (
        !usernameInput ||
        !companyInput ||
        !emailInput ||
        !phoneInput ||
        !passwordInput ||
        !confirmPasswordInput ||
        !tosCheckbox
      ) {
        showToast('Error: Form is not configured correctly!', 'error');
        showLoading(false);
        return;
      }

      // Kiểm tra validation (Giữ nguyên logic cũ của bạn)
      let ok = true;
      signupForm.querySelectorAll('.info').forEach((infoBox) => {
        let input = infoBox.querySelector('[required]');
        if (
          input &&
          (input.value == '' ||
            (input.type == 'checkbox' && !input.checked) ||
            (input.id == 'signup-mail' && !validMail.test(input.value)) ||
            (input.id == 'signup-password' &&
              !validPassword.test(input.value)) ||
            (input.id == 'signup-confirm-password' &&
              input.value !== passwordInput.value))
        ) {
          ok = false;
          infoBox.classList.add('invalid-submission');
          setTimeout(() => {
            infoBox.classList.remove('invalid-submission');
          }, 825);
        }
      });
      if (!ok) {
        showToast('Vui lòng nhập thông tin đầy đủ và chính xác!', 'error');
        showLoading(false);
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const fullName = usernameInput.value.trim();
      const company = companyInput.value.trim();
      const phone = phoneInput.value.trim();

      try {
        // 1. Tạo tài khoản trên Auth
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
        });

        if (error) throw error;

        // 2. Do chúng ta đã có Trigger tạo profile tự động lúc tạo user (khi làm Database schema),
        // chúng ta chỉ cần Update thông tin cá nhân vào profile vừa được tạo đó.
        if (data && data.user) {
          const { error: profileError } = await supabaseClient
            .from('profiles')
            .update({
              full_name: fullName,
              department: company,
              phone: phone,
              role: 'user', // Mặc định role user
              registration_status: 'pending', // Chờ duyệt
            })
            .eq('id', data.user.id);

          if (profileError) console.warn('Lỗi cập nhật profile:', profileError);
        }

        showToast(
          'Đăng ký thành công! Vui lòng chờ admin phê duyệt.',
          'success'
        );

        if (loginSlideButton) {
          loginSlideButton.click();
        }
        signupForm.reset();
      } catch (err) {
        showToast('Đăng ký thất bại: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
  }

  // ------- QUÊN MẬT KHẨU (Đã chuyển sang Supabase) -------
  var recoverForm = document.getElementById('recover-form');
  if (recoverForm) {
    recoverForm.onsubmit = async function (e) {
      e.preventDefault();
      showLoading(true);
      var email = document.getElementById('recover-user').value.trim();
      if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        showLoading(false);
        showToast('Please enter a valid email!', 'error');
        return;
      }

      try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
          email
        );
        if (error) throw error;

        showToast('Email đặt lại mật khẩu đã được gửi!', 'success');
        // Không dùng OTP nữa vì Supabase gửi magic link qua email trực tiếp
        showSection('login');
      } catch (err) {
        showToast('Lỗi: ' + err.message, 'error');
      } finally {
        showLoading(false);
      }
    };
  }

  // ------- OTP & RESET PASSWORD -------
  // Vô hiệu hóa form này vì Supabase xử lý reset password thông qua Magic Link trong email, không cần nhập mã OTP tay.
  var otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.style.display = 'none'; // Ẩn đi
  }

  // ------- Quay lại bước recover từ otp-reset -------
  var backBtn = document.getElementById('back-to-recover');
  if (backBtn) {
    backBtn.onclick = function () {
      showSection('recover');
    };
  }
});
window.onresize = () => {
  if (right && right.classList.contains('active') && signupSlideButton)
    signupSlideButton.click();
};
function resetLoginUI() {
  const loginView = document.getElementById('view-login');
  if (!loginView) return;

  loginView.querySelector('#login-form')?.reset();

  loginView.querySelector('.slider')?.classList.remove('slide');
  loginView.querySelector('.container')?.classList.remove('slide');
  loginView.querySelector('.right')?.classList.remove('active');

  loginView.querySelectorAll('.input').forEach((i) => {
    i.classList.remove('valid', 'invalid', 'active', 'hover');
  });

  // reset style (custom theme)
  loginView.removeAttribute('style');
}
function applyLoginTheme(themeName) {
  const loginView = document.getElementById('view-login');
  if (!loginView) return;

  // chỉ remove theme cũ
  loginView.classList.forEach((cls) => {
    if (
      cls !== 'app-view' &&
      cls !== 'active' &&
      cls !== 'view-login' // 🔑 GIỮ LẠI CLASS NỀN
    ) {
      loginView.classList.remove(cls);
    }
  });

  loginView.classList.add(themeName);
}
function restoreLoginTheme() {
  const loginView = document.getElementById('view-login');
  if (!loginView) return;

  const preset = localStorage.getItem('login_theme');
  const custom = localStorage.getItem('login_custom_theme');

  if (preset) {
    loginView.classList.add(preset);
  }
  if (custom) {
    loginView.setAttribute('style', custom);
  }
}

let dashboardPoller = null; // Sẽ giữ ID của bộ đếm thời gian
const POLLING_INTERVAL = 30000; // 30000ms = 30 giây
// Sửa đổi hàm DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
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

  const aarForm = document.getElementById('aarForm');
  if (aarForm) {
    aarForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      // 1. Bật loading
      customShowLoading(true);

      const formData = new FormData(this);
      const aarData = {};
      formData.forEach((value, key) => (aarData[key] = value));

      // Lấy thông tin user từ session cục bộ
      const adminName = window.userSession?.username || 'admin';
      const incidentId = document.getElementById('aar-incident-id')?.value;

      if (!incidentId) {
        showToast('Lỗi: Không tìm thấy ID ổ dịch!', 'error');
        customShowLoading(false);
        return;
      }

      try {
        // 2. CẬP NHẬT TRỰC TIẾP VÀO SUPABASE
        // Chúng ta lưu dữ liệu AAR vào cột 'aar_data' (kiểu JSONB)
        const { error } = await supabaseClient
          .from('incidents')
          .update({
            aar_data: {
              ...aarData,
              submitted_by: adminName,
              submitted_at: new Date().toISOString(),
            },
            status: 'closed', // Cập nhật trạng thái kết thúc ổ dịch
          })
          .eq('id', incidentId);

        if (error) throw error;

        // 3. THÀNH CÔNG
        showToast('Đánh giá thành công!', 'success');

        // Đóng modal
        if (typeof window.closeModal === 'function') {
          window.closeModal('aarModal');
        } else {
          $('#aarModal').modal('hide');
        }

        // 4. KHÔNG CẦN GỌI LẠI GET_INITIAL_DATA
        // Nhờ Realtime, các bảng Tracking đã tự động cập nhật dữ liệu mới từ Database
        // Bạn chỉ cần gọi lại hàm render để cập nhật hiển thị nếu cần
        if (typeof window.renderTrackingPage === 'function') {
          window.renderTrackingPage();
        }
      } catch (err) {
        console.error('Lỗi gửi AAR:', err);
        showToast('Gửi AAR thất bại: ' + err.message, 'error');
      } finally {
        customShowLoading(false);
      }
    });
  }

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
    const parts = str.split(/[/\-]/);
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
      loadUserNotifications();
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
          if (typeof dataTableInstance !== 'undefined' && dataTableInstance)
            dataTableInstance.draw();
        },
      });

      $('#filter-date-end').datepicker({
        dateFormat: 'dd/mm/yy',
        onSelect: function (selectedDate) {
          $('#filter-date-start').datepicker('option', 'maxDate', selectedDate);
          if (typeof dataTableInstance !== 'undefined' && dataTableInstance)
            dataTableInstance.draw();
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
        e.preventDefault(); // Ngăn reload nếu là thẻ <a>
        e.stopPropagation(); // Ngăn click ngoài đóng ngay lập tức

        const $wrapper = $(this);

        // 🔍 Tìm menu: ưu tiên class cụ thể, fallback ul trực tiếp
        let $menu = $wrapper.find(
          '.notification-menu, .profile-menu, ul.dropdown-menu, .dropdown'
        );

        // Nếu menu là sibling (cùng cấp) thay vì child
        if ($menu.length === 0) {
          $menu = $wrapper.siblings(
            '.notification-menu, .profile-menu, ul.dropdown-menu, .dropdown'
          );
        }

        if ($menu.length === 0) {
          console.warn('️ Không tìm thấy menu dropdown trong:', this);
          console.log(
            ' HTML cấu trúc:',
            this.outerHTML.substring(0, 150) + '...'
          );
          return;
        }

        // Đóng các menu khác đang mở
        $('.notification-menu, .profile-menu, ul.dropdown-menu, .dropdown')
          .not($menu)
          .removeClass('show');

        // Toggle menu hiện tại
        $menu.toggleClass('show');
        console.log(
          '🔽 Dropdown state:',
          $menu.hasClass('show') ? 'OPEN ✅' : 'CLOSED ❌'
        );
      });

    // Đóng khi click ra ngoài
    $(document)
      .off('click.dropdownClose')
      .on('click.dropdownClose', function (e) {
        if (!$(e.target).closest('.notification, .profile').length) {
          $(
            '.notification-menu, .profile-menu, ul.dropdown-menu, .dropdown'
          ).removeClass('show');
        }
      });

    console.log('✅ UI components initialized');
    console.log('📊 State:', window.__uiState);
  }

  function bindUserInfo(session) {
    $('.brand .text').text(session.username);
    $('#profileMenu .profile-name').text(session.username);
    $('#profileMenu .profile-email').text(session.email || 'N/A');
    if (session.avatar) {
      $('#profileMenu .profile-img').attr('src', session.avatar);
    }
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
  // ======================
  // QUẢN LÝ DASHBOARD (ADMIN & USER)
  // ======================

  // 2. HÀM ĐIỀU PHỐI GIAO DIỆN CHÍNH
  // ============================================================
  // PAGE-DASHBOARD (Đã nâng cấp: Tự động Fetch dữ liệu trực tiếp)
  // ============================================================
  window.renderDashboard = async function (customShowLoading = true) {
    try {
      // ✅ Show loading nếu cần
      if (customShowLoading && typeof window.customShowLoading === 'function') {
        window.customShowLoading(true);
      }

      // ✅ Kiểm tra phân quyền
      const isAdmin = window.isUserAdmin();
      const adminView = document.getElementById('dashboard-admin-view');
      const userView = document.getElementById('dashboard-user-view');

      if (isAdmin) {
        // ===== ADMIN VIEW =====
        if (adminView) adminView.style.display = 'block';
        if (userView) userView.style.display = 'none';

        // ✅ Fetch dữ liệu tươi (có thể dùng cache)
        const fetchProfiles = async () => {
          const { data, error } = await supabaseClient
            .from('profiles')
            .select(
              'id, email, full_name, role, team, position, deployment_status, approval_status, updated_at'
            )
            .order('updated_at', { ascending: false });
          if (error) throw error;
          return data;
        };

        const profiles =
          typeof QueryCache !== 'undefined'
            ? await QueryCache.fetch(
                'profiles:dashboard',
                fetchProfiles,
                2 * 60 * 1000
              ) // Cache 2 phút cho admin view
            : await fetchProfiles();

        const safeProfiles = profiles || [];

        // ✅ 1. Cập nhật KPI cards
        const metrics = {
          total: safeProfiles.length,
          pending: safeProfiles.filter((p) => p.approval_status === 'pending')
            .length,
          approved: safeProfiles.filter((p) => p.approval_status === 'approved')
            .length,
          edit: safeProfiles.filter((p) => p.approval_status === 'edit').length,
        };
        if (typeof updateKpiCards === 'function') updateKpiCards(metrics);

        // ✅ 2. Cập nhật bảng báo cáo gần đây (5 người mới nhất)
        if (typeof updateRecentReportsTable === 'function') {
          updateRecentReportsTable(safeProfiles.slice(0, 10));
        }

        // ✅ 3. Cập nhật todo list
        if (typeof updateTodoList === 'function') {
          updateTodoList(safeProfiles);
        }

        // ✅ 4. Load notifications
        if (typeof window.renderMessageTable === 'function') {
          await window.renderMessageTable();
        }
        if (typeof window.loadUserNotifications === 'function') {
          await window.loadUserNotifications();
        }

        // ✅ 5. Render analytics (nếu có)
        if (typeof Highcharts !== 'undefined' && window.appState?.teamData) {
          if (typeof renderAnalytics === 'function') {
            renderAnalytics(window.appState.teamData, null, null);
          }
        }
      } else {
        // ===== USER VIEW =====
        if (adminView) adminView.style.display = 'none';
        if (userView) userView.style.display = 'block';

        if (typeof window.renderUserDashboard === 'function') {
          await window.renderUserDashboard();
        }
      }
    } catch (e) {
      console.error('❌ Lỗi renderDashboard:', e);
      if (typeof showToast === 'function') {
        showToast('Không thể tải dữ liệu Dashboard: ' + e.message, 'error');
      }
    } finally {
      // ✅ Tắt loading sau 150ms để UI mượt
      if (customShowLoading && typeof window.customShowLoading === 'function') {
        setTimeout(() => window.customShowLoading(false), 150);
      }
    }
  };

  // 3. HÀM HIỂN THỊ DÀNH CHO USER BÌNH THƯỜNG
  window.renderUserDashboard = function () {
    console.log('🚀 Bắt đầu render User Dashboard...');

    const username = String(window.userSession?.username || '')
      .toLowerCase()
      .trim();
    const email = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();

    // ✅ Lấy tên hiển thị
    let displayName =
      window.userSession?.full_name || window.userSession?.username || 'user';

    if (window.appState?.profiles && Array.isArray(window.appState.profiles)) {
      const member = window.appState.profiles.find(
        (m) =>
          (m.email && String(m.email).toLowerCase().trim() === email) ||
          (m.full_name && String(m.full_name).toLowerCase().trim() === username)
      );
      if (member?.full_name) {
        displayName = member.full_name;
      }
    }

    // ✅ Cập nhật tên người dùng
    const userDashNameEl = document.getElementById('user-dash-name');
    if (userDashNameEl) {
      userDashNameEl.textContent = displayName;
    }

    // ✅ Xử lý cảnh báo sự cố
    const alertsContainer = document.getElementById('user-dash-alerts');
    if (!alertsContainer) return;

    alertsContainer.innerHTML = '';

    const incidents = window.appState?.incidents || [];
    const myActiveIncidents = incidents.filter(
      (inc) => inc.status === 'active'
    );

    if (myActiveIncidents.length === 0) {
      alertsContainer.innerHTML =
        '<li class="list-group-item text-muted">Không có sự cố đang hoạt động.</li>';
      return;
    }

    myActiveIncidents.forEach((i) => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-danger fw-bold';
      li.innerHTML = `🚨 <a href="#" onclick="simulateSidebarClick('page-tracking'); return false;" class="text-decoration-none text-danger">
        KÍCH HOẠT: ${
          window.escapeHtml?.(i.event_name) || 'Sự cố'
        } - Bấm để xem chi tiết!
      </a>`;
      alertsContainer.appendChild(li);
    });
  };
  // ============================================================
  // 3. XỬ LÝ LỊCH TRỰC (ROSTERS) VÀ THÔNG BÁO DASHBOARD
  // ============================================================
  // Tôi tách hàm này ra để có thể tái sử dụng dễ dàng khi Supabase Realtime đẩy dữ liệu về
  window.renderRosterAlerts = function () {
    const alertsContainer = document.getElementById('user-dash-alerts');
    if (!alertsContainer) return;

    // Giữ lại phần thông báo Sự cố đã render trước đó
    const existingIncidentsHTML = alertsContainer.innerHTML;
    // Dọn dẹp để vẽ lại phần Roster (Tùy chiến thuật giao diện của bạn, ở đây tôi nối tiếp vào)

    const rosters = window.appState.rosters || []; // Dữ liệu kéo từ Supabase (bảng roster_schedules & roster_assignments)

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const email = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();

    const myShifts = rosters.filter((r) => {
      const rowId = r.id || 'No-ID';
      const rDate = parseFilterDate(r.duty_date); // Sử dụng parseFilterDate (có thể thay parseAnyDate nếu bạn thích)
      if (!rDate || isNaN(rDate.getTime())) return false;

      const rDateZero = new Date(rDate);
      rDateZero.setHours(0, 0, 0, 0);

      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      if (rDateZero.getTime() < threeDaysAgo.getTime()) return false;

      // Logic check assignments (Giả sử bạn đã fetch kèm roster_assignments)
      // Tùy thuộc vào câu truy vấn Supabase: select('*, roster_assignments(*)')
      const myAssignment = (r.roster_assignments || []).find(
        (a) =>
          a.user_id === window.userSession?.id ||
          (a.profiles && a.profiles.email === email)
      );

      if (!myAssignment) return false;

      if (myAssignment.assignment_status === 'declined') return false;

      if (myAssignment.assignment_status === 'confirmed') {
        r._myStatus = 'CONFIRMED';
        r._myAssignmentId = myAssignment.id;
        return true;
      } else if (myAssignment.assignment_status === 'assigned') {
        r._myStatus = 'PENDING';
        r._myAssignmentId = myAssignment.id;
        return true;
      }
      return false;
    });

    if (myShifts.length > 0) {
      myShifts.sort(
        (a, b) => parseFilterDate(a.duty_date) - parseFilterDate(b.duty_date)
      );

      myShifts.forEach((s) => {
        const dateObj = parseFilterDate(s.duty_date);
        const dateStr = dateObj
          ? dateObj.toLocaleDateString('vi-VN')
          : s.duty_date;

        let highlightClass = '';
        let badgeHtml = '';

        if (dateObj && dateObj.getTime() === tomorrow.getTime()) {
          highlightClass = 'list-group-item-warning';
          badgeHtml += '<span class="badge bg-danger ms-1">NGÀY MAI</span>';
        } else if (dateObj && dateObj.getTime() === today.getTime()) {
          highlightClass = 'list-group-item-success';
          badgeHtml += '<span class="badge bg-success ms-1">HÔM NAY</span>';
        }

        let statusBadge = '';
        let actionLink = '';

        if (s._myStatus === 'PENDING') {
          statusBadge =
            '<span class="badge bg-warning text-dark ms-1">Chờ xác nhận</span>';
          if (!highlightClass)
            highlightClass = 'border-warning border-start border-4';
          // Truyền _myAssignmentId thay vì r.calendar
          actionLink = ` <a href="#" onclick="openQuickResponseModal('${s._myAssignmentId}', '${dateStr}', '${s.team_name}')" class="text-decoration-none small ms-2 fw-bold text-primary fst-italic">
          <i class='bx bx-edit'></i> Phản hồi ngay
        </a>`;
        } else {
          statusBadge = '<span class="badge bg-primary ms-1">Đã nhận</span>';
        }

        const li = document.createElement('li');
        li.className = `list-group-item ${highlightClass}`;
        li.innerHTML = `
          <div class="d-flex w-100 justify-content-between align-items-center">
              <div>
                  <i class='bx bx-calendar text-primary'></i> 
                  Lịch trực <b>${s.team_name}</b> 
                  ${badgeHtml} ${statusBadge}
                  ${actionLink}
              </div>
              <small class="text-muted fw-bold">${dateStr}</small>
          </div>
      `;
        alertsContainer.appendChild(li);
      });
    }

    if (alertsContainer.children.length === 0) {
      alertsContainer.innerHTML =
        '<li class="list-group-item text-muted text-center py-3">Không có thông báo mới.</li>';
    }
  };
  // ============================================================
  // HÀM ĐIỀU HƯỚNG TẮT & MODAL PHẢN HỒI
  // ============================================================
  window.openQuickResponseModal = function (assignmentId, dateStr, teamName) {
    const modalHtml = `
  <div class="modal fade" id="modal-quick-response" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content shadow">
        <div class="modal-header bg-light">
          <h5 class="modal-title">👮 Phản hồi Lịch trực định kỳ </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body text-center p-4">
          <h4 class="mb-3 text-primary">${teamName}</h4>
          <p class="mb-4">Bạn có lịch trực vào ngày <strong>${dateStr}</strong>.<br>Vui lòng xác nhận khả năng tham gia của bạn.</p>
          
          <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
            <button onclick="submitRosterResponse('${assignmentId}', 'confirmed')" class="btn btn-success btn-lg px-4 gap-3">
              <i class='bx bx-check-circle'></i> TÔI THAM GIA
            </button>
            <button onclick="submitRosterResponse('${assignmentId}', 'declined')" class="btn btn-outline-danger btn-lg px-4">
              <i class='bx bx-x-circle'></i> TỪ CHỐI
            </button>
          </div>
          <div id="response-loading" class="mt-3 text-muted" style="display:none">
              <span class="spinner-border spinner-border-sm"></span> Đang xử lý...
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

    const oldModal = document.getElementById('modal-quick-response');
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const myModal = new bootstrap.Modal(
      document.getElementById('modal-quick-response')
    );
    myModal.show();
  };
  // Hàm gửi dữ liệu về Server (Đã sửa để dùng Core Function xịn sò của bạn)
  window.submitRosterResponse = async function (assignmentId, actionStatus) {
    const loading = document.getElementById('response-loading');
    const btns = document.querySelectorAll('#modal-quick-response button');

    if (loading) loading.style.display = 'block';
    btns.forEach((b) => (b.disabled = true));

    try {
      // Cập nhật trạng thái trực tiếp vào bảng roster_assignments
      const { error } = await supabaseClient
        .from('roster_assignments')
        .update({ assignment_status: actionStatus })
        .eq('id', assignmentId);

      if (error) throw error;

      // Đóng modal
      const el = document.getElementById('modal-quick-response');
      if (el) {
        const modal = bootstrap.Modal.getInstance(el);
        if (modal) modal.hide();
        el.remove();
      }

      showToast(
        actionStatus === 'confirmed'
          ? 'Đã xác nhận tham gia! ✅'
          : 'Đã từ chối lịch trực! ❌',
        'success'
      );

      // Tải lại dữ liệu Dashboard (Sẽ tự động cập nhật qua Realtime)
      if (typeof window.enterDashboard === 'function')
        await window.enterDashboard();
    } catch (err) {
      showToast('Lỗi cập nhật: ' + err.message, 'error');
    } finally {
      if (loading) loading.style.display = 'none';
      btns.forEach((b) => (b.disabled = false));
    }
  };
  /**
   * Hàm này giúp chuyển trang bằng cách giả lập cú click vào menu bên trái.
   * Dùng cho các nút "Xem ngay", "Bấm vào đây" ở Dashboard.
   */
  window.simulateSidebarClick = function (targetId) {
    const menuLink = document.querySelector(
      `#sidebar .side-menu li a[data-target="${targetId}"]`
    );
    if (menuLink) {
      menuLink.click();
    } else {
      if (typeof showSectionById === 'function') {
        showSectionById(targetId);
      } else {
        console.error('Lỗi: Hàm showSectionById chưa được định nghĩa.');
      }
    }
  };
  // ============================================================
  // PAGE-TEAM (BIỂU ĐỒ NĂNG LỰC)
  // ============================================================
  // Trong hàm load data chính
  window.loadAllData = async function () {
    try {
      // Load users
      const { data: users } = await supabaseClient
        .from('profiles')
        .select('id, email, full_name, team, position');

      // Load training
      await window.loadTrainingData();

      // Load deployment history
      const { data: deployments } = await supabaseClient
        .from('deployment_history')
        .select('*');

      // ✅ FIX: GỘP vào appState hiện có bằng spread {...window.appState, ...},
      // KHÔNG ghi đè nguyên cả object như trước. Trước đây dòng này thay thế
      // toàn bộ window.appState chỉ bằng {users, training, deployment_history},
      // xóa mất cờ appInitialized cùng các dữ liệu khác (incidents, map,
      // notifications...) -> khiến các nơi khác nghĩ dashboard "chưa init" và
      // tải lại từ đầu, góp phần gây race condition khi F5.
      window.appState = {
        ...window.appState,
        users: users || [],
        training: window.appState?.training || { courses: [], records: [] },
        deployment_history: deployments || [],
      };

      // Render charts
      if (typeof renderCompetencyChart === 'function') {
        renderCompetencyChart(window.appState.users);
      }
    } catch (err) {
      console.error('Lỗi load data:', err);
    }
  };
  function renderCompetencyChart(filteredMembers) {
    // ✅ FIX: Lấy đúng filteredMembers
    if (!filteredMembers || !Array.isArray(filteredMembers)) {
      filteredMembers = window.appState?.users || [];
    }

    // ✅ FIX: Lấy đúng path của training records và deployment history
    const trainingRecords = window.appState?.training?.records || [];
    const deploymentHistory = window.appState?.deployment_history || [];

    const teams = {};

    // Khởi tạo teams từ filteredMembers
    filteredMembers.forEach((m) => {
      const teamName = m.team || 'No team';
      if (!teams[teamName]) {
        teams[teamName] = { trained: 0, combat: 0, total: 0 };
      }
      teams[teamName].total++;
    });

    // ✅ FIX: Đếm số lượng training đã pass theo user
    if (trainingRecords.length > 0) {
      const trainedByUser = {};

      trainingRecords.forEach((r) => {
        if (r.result === 'pass') {
          // ✅ Dùng profile_id hoặc user_id
          const userId = r.profile_id || r.user_id;
          if (userId) {
            trainedByUser[userId] = (trainedByUser[userId] || 0) + 1;
          }
        }
      });

      // ✅ Gán vào team dựa trên member
      filteredMembers.forEach((m) => {
        const userId = m.id;
        const teamName = m.team || 'No team';
        if (teams[teamName] && trainedByUser[userId]) {
          teams[teamName].trained += trainedByUser[userId];
        }
      });
    }

    // ✅ FIX: Đếm số lần deployment (thực chiến) - chỉ tính incident_id hợp lệ
    if (deploymentHistory.length > 0) {
      const deployedByUser = {};

      deploymentHistory.forEach((h) => {
        // ✅ Chỉ tính các action hợp lệ và có incident_id
        if (
          (h.action_type === 'deployed' || h.action_type === 'replaced') &&
          h.incident_id
        ) {
          const userId = h.profile_id || h.user_id;
          if (userId) {
            deployedByUser[userId] = (deployedByUser[userId] || 0) + 1;
          }
        }
      });

      // ✅ Gán vào team
      filteredMembers.forEach((m) => {
        const userId = m.id;
        const teamName = m.team || 'No team';
        if (teams[teamName] && deployedByUser[userId]) {
          teams[teamName].combat += deployedByUser[userId];
        }
      });
    }

    // Tính average per team
    const categories = Object.keys(teams).sort();
    const dataTrained = [];
    const dataCombat = [];

    categories.forEach((team) => {
      const stat = teams[team];
      const avgTrained =
        stat.total > 0 ? parseFloat((stat.trained / stat.total).toFixed(1)) : 0;
      const avgCombat =
        stat.total > 0 ? parseFloat((stat.combat / stat.total).toFixed(1)) : 0;
      dataTrained.push(avgTrained);
      dataCombat.push(avgCombat);
    });

    // Render chart hoặc message
    const hasData =
      dataTrained.some((v) => v > 0) || dataCombat.some((v) => v > 0);
    const chartContainer = document.getElementById('competencyChartAP');

    if (!chartContainer) {
      console.warn('⚠️ Chart container #competencyChartAP not found');
      return;
    }

    if (!hasData) {
      chartContainer.innerHTML =
        '<p class="text-center text-muted" style="padding: 50px 20px;">' +
        '📊 <strong>Chưa có dữ liệu năng lực.</strong><br><br>' +
        '<small>Hệ thống cần có:<br>' +
        '• Dữ liệu tham gia đào tạo, tập huấn<br>' +
        '• Dữ liệu tham gia sự kiện kích hoạt khẩn cấp</small>' +
        '</p>';
      return;
    }

    // ✅ Vẽ biểu đồ Highcharts
    if (typeof Highcharts === 'undefined') {
      console.error('❌ Highcharts not loaded');
      chartContainer.innerHTML =
        '<p class="text-danger">Thư viện biểu đồ chưa được tải.</p>';
      return;
    }

    Highcharts.chart('competencyChartAP', {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        style: { fontFamily: "'Ubuntu', sans-serif" },
      },
      title: {
        text: 'Năng lực Trung bình theo Đội (Đào tạo vs Thực chiến)',
        style: { fontSize: '16px', fontWeight: 'bold' },
      },
      subtitle: { text: 'Chỉ số trung bình trên mỗi thành viên' },
      xAxis: {
        categories: categories,
        crosshair: true,
        labels: { style: { fontSize: '12px' } },
      },
      yAxis: {
        min: 0,
        title: { text: 'Số lượng (Avg)', style: { color: '#666' } },
        labels: { style: { fontSize: '11px' } },
      },
      tooltip: {
        shared: true,
        headerFormat: '<b>{point.x}</b><br/>',
        pointFormat: '{series.name}: <b>{point.y}</b>{point.suffix}',
      },
      legend: {
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        x: 0,
        y: 0,
        floating: false,
        backgroundColor: 'rgba(255,255,255,0.9)',
        itemStyle: { fontSize: '12px' },
      },
      plotOptions: {
        column: {
          borderRadius: 6,
          dataLabels: {
            enabled: true,
            style: { fontSize: '11px', fontWeight: 'bold' },
          },
          pointPadding: 0.2,
          groupPadding: 0.1,
        },
      },
      series: [
        {
          name: '📚 Đào tạo (chứng chỉ/người)',
          data: dataTrained.map((v, i) => ({
            y: v,
            suffix: ' khóa',
          })),
          color: 'rgba(54, 162, 235, 0.85)',
        },
        {
          name: '⚡ Thực chiến (lần tham gia/người)',
          data: dataCombat.map((v, i) => ({
            y: v,
            suffix: ' lần',
          })),
          color: 'rgba(255, 99, 132, 0.85)',
        },
      ],
      credits: { enabled: false },
    });

    console.log('✅ Competency chart rendered:', {
      teams: categories,
      dataTrained,
      dataCombat,
    });
  }

  window.updateKpiCards = async function () {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      console.log('📊 Updating KPI Cards...');

      // Hàm hỗ trợ rút gọn danh sách tên hiển thị trên Card (Chống vỡ giao diện)
      const formatNameList = (arr) => {
        if (!arr || arr.length === 0) return 'Chưa có dữ liệu';
        const unique = [...new Set(arr)].filter(Boolean);
        if (unique.length === 0) return 'Chưa có dữ liệu';
        if (unique.length <= 2) return unique.join(', ');
        return `${unique[0]}, ${unique[1]} và ${unique.length - 2} người khác`;
      };

      const setHtml = (selector, value) => {
        const el = $(selector);
        if (el.length) el.html(value);
      };

      // ===========================================
      // 1. FETCH TẤT CẢ PROFILES ĐỂ MAP TÊN
      // ===========================================
      // Lấy sẵn toàn bộ profile để tra cứu tên cho nhanh, thay vì hiển thị Email hay UUID
      const { data: allProfiles } = await window.supabaseClient
        .from('profiles')
        .select('id, email, full_name');
      const profiles = allProfiles || [];

      const getNameById = (id) => {
        const p = profiles.find((x) => x.id === id);
        return p ? p.full_name || p.email : 'Ẩn danh';
      };

      const getNameByEmail = (email) => {
        if (!email) return '';
        const p = profiles.find(
          (x) => String(x.email).toLowerCase() === String(email).toLowerCase()
        );
        return p ? p.full_name || p.email : email;
      };

      // ===========================================
      // 2. KPI LỊCH TRỰC (ROSTER ASSIGNMENTS)
      // ===========================================
      const { data: assignmentsData, error: rErr } = await window.supabaseClient
        .from('roster_assignments')
        .select(
          `
          assignment_status,
          user_id,
          roster_schedules!inner (duty_date, team_name)
        `
        )
        .gte('roster_schedules.duty_date', today.toISOString())
        .lte('roster_schedules.duty_date', sevenDaysLater.toISOString());

      if (rErr) console.warn('⚠️ Lỗi tải roster_assignments:', rErr);

      const rosterItems = assignmentsData || [];

      let rConfNames = [],
        rDecNames = [],
        rPendNames = [];
      let activeTeams = new Set();

      rosterItems.forEach((r) => {
        const name = getNameById(r.user_id);
        if (r.roster_schedules?.team_name)
          activeTeams.add(r.roster_schedules.team_name);

        if (r.assignment_status === 'confirmed') rConfNames.push(name);
        else if (r.assignment_status === 'declined') rDecNames.push(name);
        else rPendNames.push(name); // assigned, pending
      });

      const rTotal = rosterItems.length;

      // ===========================================
      // 3. KPI KÍCH HOẠT KHẨN CẤP (INCIDENTS)
      // ===========================================
      const { data: incidentsData, error: incidentsErr } =
        await window.supabaseClient
          .from('incidents')
          .select('id, event_name, activation_time, members, declined_members')
          .gte('activation_time', today.toISOString())
          .lte('activation_time', sevenDaysLater.toISOString());

      if (incidentsErr) console.warn('⚠️ Lỗi tải incidents:', incidentsErr);

      const incidents = incidentsData || [];
      const incidentIds = incidents.map((i) => i.id);

      let iConfNames = [],
        iDecNames = [],
        iPendNames = [];
      let latestActivation = 'Chưa có sự kiện';

      if (incidents.length > 0) {
        // Sắp xếp lấy sự kiện mới nhất để hiển thị thời gian
        const sortedIncidents = [...incidents].sort(
          (a, b) => new Date(b.activation_time) - new Date(a.activation_time)
        );
        const latestTime = new Date(sortedIncidents[0].activation_time);
        latestActivation = `Gần nhất: ${latestTime.toLocaleTimeString(
          'vi-VN'
        )} ${latestTime.toLocaleDateString('vi-VN')}`;

        // Lấy danh sách Pending từ Notifications
        const { data: notifs } = await window.supabaseClient
          .from('notifications')
          .select('user_email, response_status')
          .in('incident_id', incidentIds)
          .eq('response_status', 'pending');

        const pendingNotifs = notifs || [];
        pendingNotifs.forEach((n) =>
          iPendNames.push(getNameByEmail(n.user_email))
        );
      }

      // Tách chuỗi Email thành Tên đối với những người đã Xác nhận/Từ chối
      incidents.forEach((inc) => {
        if (inc.members) {
          inc.members
            .split(';')
            .filter(Boolean)
            .forEach((email) => iConfNames.push(getNameByEmail(email)));
        }
        if (inc.declined_members) {
          inc.declined_members
            .split(';')
            .filter(Boolean)
            .forEach((email) => iDecNames.push(getNameByEmail(email)));
        }
      });

      // ===========================================
      // 4. BƠM DỮ LIỆU VÀO GIAO DIỆN HTML (DOM)
      // ===========================================

      // --- Dòng 1: Lịch Trực ---
      setHtml('#schedule-total-count', rTotal);
      setHtml('#schedule-confirmed-count', rConfNames.length);
      setHtml('#schedule-declined-count', rDecNames.length);
      setHtml('#schedule-pending-count', rPendNames.length);

      const dateRangeText = `${today.getDate()}/${
        today.getMonth() + 1
      } - ${sevenDaysLater.getDate()}/${sevenDaysLater.getMonth() + 1}`;
      setHtml('#schedule-dates-info', dateRangeText);
      setHtml(
        '#schedule-dates-team',
        activeTeams.size > 0
          ? Array.from(activeTeams).join(', ')
          : 'Chưa xếp đội'
      );

      setHtml('#schedule-confirmed-members', formatNameList(rConfNames));
      setHtml('#schedule-declined-members', formatNameList(rDecNames));
      setHtml('#schedule-pending-members', formatNameList(rPendNames));

      // --- Dòng 2: Kích Hoạt Khẩn Cấp ---
      setHtml('#emergency-activations-count', incidents.length);
      setHtml('#emergency-confirmed-count', iConfNames.length);
      setHtml('#emergency-declined-count', iDecNames.length);
      setHtml('#emergency-pending-count', iPendNames.length);

      setHtml('#emergency-times-info', latestActivation);
      setHtml('#emergency-confirmed-members', formatNameList(iConfNames));
      setHtml('#emergency-declined-members', formatNameList(iDecNames));
      setHtml('#emergency-pending-members', formatNameList(iPendNames));

      // --- Animation & Badges (Nếu có thẻ khai báo ở ngoài) ---
      if (typeof handleCounterAnimation === 'function')
        handleCounterAnimation();
    } catch (error) {
      console.error('❌ Lỗi updateKpiCards:', error);
      if (typeof showToast === 'function')
        showToast('Lỗi cập nhật Dashboard: ' + error.message, 'error');
    }
  };

  // ========================================================================
  // AUTO-REFRESH KPI (Mỗi 30 giây)
  // ========================================================================
  if (window._kpiInterval) clearInterval(window._kpiInterval);
  window._kpiInterval = setInterval(() => {
    if (typeof window.updateKpiCards === 'function') {
      window.updateKpiCards();
    }
  }, 30000);

  // Chạy lần đầu khi DOM ready
  $(document).ready(function () {
    if (typeof window.updateKpiCards === 'function') {
      window.updateKpiCards();
    }
  });

  function handleCounterAnimation() {
    if (typeof animateCounters === 'function') {
      animateCounters();
      return;
    }
    $('.card h3, .card h4').each(function () {
      const $this = $(this);
      const val = parseInt($this.text().replace(/\./g, ''));
      if (!isNaN(val) && val > 0) {
        $({ Counter: 0 }).animate(
          { Counter: val },
          {
            duration: 1000,
            easing: 'swing',
            step: function (now) {
              $this.text(Math.ceil(now));
            },
          }
        );
      }
    });
  }

  // ==========================================
  // XỬ LÝ SỰ KIỆN ENTER CHO CHAT
  // ==========================================
  $(document).ready(function () {
    $('#inp-chat').on('keypress', function (e) {
      if (e.which === 13) {
        e.preventDefault();
        if (typeof window.sendDossierMessage === 'function') {
          window.sendDossierMessage('Message');
        }
      }
    });
  });

  // ==========================================
  // TÍNH NĂNG XUẤT EXCEL TỪ SUPABASE (THAY THẾ GAS)
  // ==========================================
  // Sử dụng thư viện SheetJS (XLSX) đã nhúng ở index.html
  async function setupExportButton(btnSelector, tableName, fileNamePrefix) {
    $(btnSelector)
      .off('click')
      .on('click', async function () {
        const btn = $(this);
        const originalText = btn.html();

        try {
          // 1. Hiệu ứng Loading
          btn
            .prop('disabled', true)
            .html('<i class="bx bx-loader-alt bx-spin"></i> Đang tải...');
          if (typeof showToast === 'function')
            showToast(`Đang truy xuất dữ liệu từ ${tableName}...`, 'info');

          let data = [];

          // 2. Xử lý riêng cho bảng profiles (cần join phức tạp)
          if (tableName === 'profiles') {
            // Fetch profiles
            const { data: profilesData, error: profilesErr } =
              await window.supabaseClient
                .from('profiles')
                .select('*')
                .order('full_name', { ascending: true });

            if (profilesErr) throw profilesErr;
            if (!profilesData || profilesData.length === 0) {
              if (typeof showToast === 'function')
                showToast('Không có dữ liệu để xuất!', 'warning');
              btn.prop('disabled', false).html(originalText);
              return;
            }

            const profileIds = profilesData.map((p) => p.id);

            // ==========================================
            // [A] FETCH RRT QUALIFICATIONS (KỸ NĂNG)
            // ==========================================
            const { data: qualsData, error: qualsErr } =
              await window.supabaseClient
                .from('rrt_qualifications')
                .select('profile_id, skills')
                .in('profile_id', profileIds);

            if (qualsErr)
              console.warn('⚠️ Warning fetching qualifications:', qualsErr);

            const skillsMap = {};
            (qualsData || []).forEach((q) => {
              skillsMap[q.profile_id] = q.skills || {};
            });

            // ==========================================
            // [B] FETCH TRAINING HISTORY (ĐÀO TẠO)
            // ==========================================
            const trainingMap = {};
            const { data: trainRecords } = await window.supabaseClient
              .from('training_records')
              .select('user_id, course_id, result')
              .in('user_id', profileIds);

            if (trainRecords && trainRecords.length > 0) {
              const courseIds = [
                ...new Set(
                  trainRecords.map((r) => r.course_id).filter(Boolean)
                ),
              ];
              const { data: courses } = await window.supabaseClient
                .from('training_courses')
                .select('id, course_name')
                .in('id', courseIds);

              const coursesMap = {};
              (courses || []).forEach(
                (c) => (coursesMap[c.id] = c.course_name)
              );

              // Gom nhóm theo user
              trainRecords.forEach((record) => {
                if (!trainingMap[record.user_id])
                  trainingMap[record.user_id] = [];
                const courseName =
                  coursesMap[record.course_id] || 'Khóa học ẩn';
                const result =
                  record.result === 'pass'
                    ? 'Đạt'
                    : record.result === 'fail'
                    ? 'Chưa đạt'
                    : 'Đang xử lý';
                trainingMap[record.user_id].push(`[${result}] ${courseName}`);
              });
            }

            // ==========================================
            // [C] FETCH DEPLOYMENT HISTORY (THỰC CHIẾN)
            // ==========================================
            const expMap = {};
            const { data: expRecords } = await window.supabaseClient
              .from('deployment_history')
              .select('user_id, incident_id, action_type')
              .in('user_id', profileIds);

            if (expRecords && expRecords.length > 0) {
              const incidentIds = [
                ...new Set(
                  expRecords.map((r) => r.incident_id).filter(Boolean)
                ),
              ];
              const { data: incidents } = await window.supabaseClient
                .from('incidents')
                .select('id, event_name')
                .in('id', incidentIds);

              const incidentsMap = {};
              (incidents || []).forEach(
                (i) => (incidentsMap[i.id] = i.event_name)
              );

              // Gom nhóm theo user
              expRecords.forEach((record) => {
                if (!expMap[record.user_id]) expMap[record.user_id] = [];
                const eventName =
                  incidentsMap[record.incident_id] || 'Sự kiện ẩn';
                const role = record.action_type || 'Thành viên';
                expMap[record.user_id].push(`${eventName} (${role})`);
              });
            }

            // ==========================================
            // [D] MERGE TẤT CẢ VÀO 1 DÒNG DUY NHẤT
            // ==========================================
            data = profilesData.map((profile) => {
              const skills = skillsMap[profile.id] || {};
              const trainHistoryStr = trainingMap[profile.id]
                ? trainingMap[profile.id].join(' | ')
                : '';
              const expHistoryStr = expMap[profile.id]
                ? expMap[profile.id].join(' | ')
                : '';

              // Bung JSONB skills ra thành các cột flat
              const flattenedSkills = {
                skill_ungpho_has: skills.emergency_response?.has_skill || false,
                skill_ungpho_level: skills.emergency_response?.level || '',
                skill_ruiro_has: skills.risk_communication?.has_skill || false,
                skill_ruiro_level: skills.risk_communication?.level || '',
                skill_tamly_has: skills.psycho_social?.has_skill || false,
                skill_tamly_level: skills.psycho_social?.level || '',
                skill_dulieu_has: skills.data_management?.has_skill || false,
                skill_dulieu_level: skills.data_management?.level || '',
                skill_dichte_has: skills.epidemiology?.has_skill || false,
                skill_dichte_level: skills.epidemiology?.level || '',
                skill_nhiemtrung_has:
                  skills.infection_control?.has_skill || false,
                skill_nhiemtrung_level: skills.infection_control?.level || '',
                skill_thinghiem_has: skills.lab?.has_skill || false,
                skill_thinghiem_level: skills.lab?.level || '',
                skill_haucan_has: skills.logistics?.has_skill || false,
                skill_haucan_level: skills.logistics?.level || '',
                skill_vanhanh_has:
                  skills.operation_materials?.has_skill || false,
                skill_vanhanh_level: skills.operation_materials?.level || '',
                skill_cabenh_has: skills.case_management?.has_skill || false,
                skill_cabenh_level: skills.case_management?.level || '',
                skill_dinhduong_has: skills.food_management?.has_skill || false,
                skill_dinhduong_level: skills.food_management?.level || '',
                skill_nuoc_has: skills.wash_management?.has_skill || false,
                skill_nuoc_level: skills.wash_management?.level || '',
                skill_nguyhiem_has:
                  skills.hazardous_management?.has_skill || false,
                skill_nguyhiem_level: skills.hazardous_management?.level || '',
                skill_anninh_has:
                  skills.security_management?.has_skill || false,
                skill_anninh_level: skills.security_management?.level || '',
              };

              // Merge profile + skills + history columns
              return {
                ...profile,
                ...flattenedSkills,
                'Lịch sử Đào tạo & Chứng chỉ': trainHistoryStr,
                'Kinh nghiệm Thực chiến': expHistoryStr,
              };
            });
          } else {
            // 3. Fetch bình thường cho các bảng khác
            const { data: normalData, error } = await window.supabaseClient
              .from(tableName)
              .select('*');

            if (error) throw error;
            data = normalData || [];
          }

          if (data.length === 0) {
            if (typeof showToast === 'function')
              showToast('Không có dữ liệu để xuất!', 'warning');
            return;
          }

          // 4. Dùng SheetJS tạo file Excel
          if (typeof XLSX === 'undefined') {
            throw new Error(
              'Không tìm thấy thư viện SheetJS. Hãy kiểm tra thẻ <script> ở index.html'
            );
          }

          const worksheet = XLSX.utils.json_to_sheet(data);

          // Auto-size columns
          const colWidths = Object.keys(data[0] || {}).map((key) => ({
            wch:
              Math.max(
                key.length,
                ...data.map((row) => String(row[key] || '').length)
              ) + 2,
          }));
          worksheet['!cols'] = colWidths;

          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

          // 5. Tải file về máy
          const fileName = `${fileNamePrefix}_${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`;
          XLSX.writeFile(workbook, fileName);

          if (typeof showToast === 'function')
            showToast(`✅ Đã xuất ${data.length} dòng thành công!`, 'success');
        } catch (err) {
          console.error('Lỗi xuất file:', err);
          if (typeof showToast === 'function')
            showToast('Lỗi: ' + err.message, 'error');
        } finally {
          // 6. Trả lại nút ban đầu
          btn.prop('disabled', false).html(originalText);
        }
      });
  }

  // Kích hoạt nút bấm Export khi tải xong trang
  $(document).ready(function () {
    setupExportButton('#btn-export-members', 'profiles', 'RRT_NhanSu');
    setupExportButton(
      '#btn-export-logistics',
      'logistics_logs',
      'RRT_Logistics'
    );
  });

  /**
   * Hàm xử lý khi tải dữ liệu thất bại
   */
  window.onInitialDataFailure = function (error) {
    console.error('❌ LỖI TẢI DỮ LIỆU:', error);
    hideLoadingSpinner();
    showToast('Lỗi cập nhật dữ liệu: ' + (error.message || error), 'error');
  };

  // ============================================================
  // HÀM ĐỒNG BỘ TRACKING (REALTIME)
  // ============================================================

  // Thay vì Polling, chúng ta dùng Realtime của Supabase
  window.initTrackingRealtime = function () {
    if (!window.userSession) return;

    // 1. Lắng nghe thay đổi trên bảng 'incidents'
    const incidentChannel = supabaseClient
      .channel('tracking_incidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          console.log('⚡ Incident update detected:', payload);
          // Refresh dữ liệu Dashboard
          if (typeof window.enterDashboard === 'function')
            window.enterDashboard();
          // Cập nhật lại UI Tracking nếu đang mở
          if (
            document.getElementById('page-tracking')?.style.display !== 'none'
          ) {
            if (typeof window.renderTrackingPage === 'function')
              window.renderTrackingPage();
          }
        }
      )
      .subscribe();

    // 2. Lắng nghe thay đổi trên bảng 'roster_assignments'
    const rosterChannel = supabaseClient
      .channel('tracking_rosters')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roster_assignments' },
        (payload) => {
          console.log('⚡ Roster update detected:', payload);
          if (typeof window.renderTrackingPage === 'function')
            window.renderTrackingPage();
        }
      )
      .subscribe();
  };

  /**
   * Helper: Cập nhật danh sách thành viên (PHIÊN BẢN KHÔNG CÒN GOOGLE APPS SCRIPT)
   */
  window.updateDossierMemberList = async function (inc) {
    const memberListEl = document.getElementById('dossier-member-list');
    if (!memberListEl) return;

    // 1. Lấy dữ liệu mới nhất từ Supabase (Đảm bảo không dùng dữ liệu cũ)
    const { data: profiles } = await window.supabaseClient
      .from('profiles')
      .select('*');

    // Tạo Map tra cứu (Map trực tiếp từ data vừa fetch)
    const memberMap = {};
    if (profiles) {
      profiles.forEach((m) => {
        if (m.email) memberMap[m.email.toLowerCase().trim()] = m;
      });
    }

    memberListEl.innerHTML = '';
    const invitedEmails = (inc.initial_selected_members || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const confirmedStr = (inc.members || '').toLowerCase();
    const declinedStr = (inc.declined_members || '').toLowerCase();

    let countConfirmed = 0,
      countDeclined = 0,
      countPending = 0;

    // 2. Duyệt danh sách
    invitedEmails.forEach((email) => {
      const emailLower = email.toLowerCase();
      const memInfo = memberMap[emailLower];

      // Lấy thông tin từ profiles (nếu có)
      const fullName = memInfo?.full_name || email;
      const teamName = memInfo?.team || 'Chưa phân đội';
      const position = memInfo?.position || 'Thành viên';

      const isMe =
        window.userSession?.email &&
        emailLower === window.userSession.email.toLowerCase();
      const displayName = isMe ? `${fullName} (Tôi)` : fullName;

      // 3. Logic xác định trạng thái (Dùng includes để kiểm tra)
      let status = 'PENDING';
      if (
        confirmedStr.includes(emailLower) ||
        (memInfo?.full_name &&
          confirmedStr.includes(memInfo.full_name.toLowerCase()))
      ) {
        status = 'CONFIRMED';
        countConfirmed++;
      } else if (
        declinedStr.includes(emailLower) ||
        (memInfo?.full_name &&
          declinedStr.includes(memInfo.full_name.toLowerCase()))
      ) {
        status = 'DECLINED';
        countDeclined++;
      } else {
        countPending++;
      }

      const statusConfig = {
        CONFIRMED: { badge: 'bg-success', text: 'Xác nhận', icon: 'bx-check' },
        DECLINED: { badge: 'bg-danger', text: 'Từ chối', icon: 'bx-x' },
        PENDING: { badge: 'bg-secondary', text: 'Chờ...', icon: 'bx-loader' },
      };
      const st = statusConfig[status];

      memberListEl.insertAdjacentHTML(
        'beforeend',
        `
            <div class="member-row" style="${
              isMe ? 'background-color: #f0f7ff;' : ''
            } padding: 12px; margin-bottom: 8px; display: flex; align-items: center; border-radius: 8px; border: 1px solid #f0f0f0;">
                <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded"
                     style="width: 40px; height: 40px; background-color: #6c757d;">
                    ${(fullName || 'U').charAt(0).toUpperCase()}
                </div>
                <div style="flex-grow: 1; overflow: hidden;">
                    <div class="fw-bold text-dark">${window.escapeHtml(
                      displayName
                    )}</div>
                    <div style="font-size: 11px; color: #666;">
                        <i class='bx bx-group'></i> ${window.escapeHtml(
                          teamName
                        )} | 
                        <span class="badge bg-light text-dark border">${window.escapeHtml(
                          position
                        )}</span>
                    </div>
                </div>
                <div style="margin-left: 10px;">
                    <span class="badge ${st.badge}"><i class="bx ${
          st.icon
        }"></i> ${st.text}</span>
                </div>
            </div>
        `
      );
    });

    // 4. Cập nhật Panel Thống kê
    const panels = document.querySelectorAll(
      '#tracking-view-dossier .col-static .panel'
    );
    if (panels.length >= 2) {
      panels[1].innerHTML = `
            <h5>📊 Thống kê Phản hồi</h5>
            <div class="d-flex justify-content-between mb-1 text-success"><span><i class='bx bx-check-circle'></i> Xác nhận:</span> <strong>${countConfirmed}</strong></div>
            <div class="d-flex justify-content-between mb-1 text-danger"><span><i class='bx bx-x-circle'></i> Từ chối:</span> <strong>${countDeclined}</strong></div>
            <div class="d-flex justify-content-between text-secondary border-top pt-2"><span><i class='bx bx-time'></i> Chưa trả lời:</span> <strong>${countPending}</strong></div>
        `;
    }
  };

  // Hàm vẽ biểu đồ và bảng tóm tắt
  /**
   * Renders the analytics charts and summary table based on team data.
   * @param {Array<Object>} teamData - The data array from getTeamRegisterData.
   * @param {string} startDate - The start date for filtering (YYYY-MM-DD).
   * @param {string} endDate - The end date for filtering (YYYY-MM-DD).
   */
  window.renderAnalytics = async function (teamData, startDate, endDate) {
    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      // ==========================================
      // BƯỚC 1: TẢI ĐỘC LẬP 2 BẢNG (Tránh lỗi Join của Supabase)
      // ==========================================
      const [profilesRes, qualRes] = await Promise.all([
        supabaseClient.from('profiles').select('*'),
        supabaseClient.from('rrt_qualifications').select('*'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (qualRes.error) throw qualRes.error;

      let filteredData = profilesRes.data || [];
      const allQuals = qualRes.data || []; // Chứa toàn bộ dữ liệu Kỹ năng, Ngoại ngữ

      // Lọc theo ngày
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        filteredData = filteredData.filter((r) => {
          const regDate = new Date(r.updated_at || r.created_at);
          return regDate >= start && regDate <= end;
        });
      }

      function getColorPalette() {
        return {
          male: '#4361ee',
          female: '#f72585',
          pending: '#fcbf49',
          edit: '#2a9d8f',
          approved: '#2a9d8f',
          academic1: '#83adb5',
          academic2: '  #5e3c58',
          academic3: '#ff0079',
          academicOther: '#f72585',
          levelBeginner: '#4cc9f0',
          levelIntermediate: '#4361ee',
          levelAdvanced: '#3a0ca3',
          levelExpert: '#7209b7',
          academicLevel1: '#4361ee',
          academicLevel2: '#3a0ca3',
          academicLevel3: '#7209b7',
        };
      }
      const colors = getColorPalette();

      if (typeof Highcharts !== 'undefined') {
        Highcharts.setOptions({
          chart: { style: { fontFamily: "'Ubuntu', sans-serif" } },
        });
      }

      // ==========================================
      // KHỞI TẠO BIẾN ĐẾM
      // ==========================================
      const genderCounts = { Male: 0, Female: 0 };
      const statusCounts = { pending: 0, edit: 0, approved: 0 };

      const academicCounts = {
        'Y khoa và Điều dưỡng': 0,
        'Y tế công cộng': 0,
        'Kỹ thuật và Quản lý': 0,
      };
      const academicLevelCounts = {
        'Trung cấp/Cao đẳng': 0,
        'Đại học': 0,
        'Sau Đại học': 0,
      };

      const languageOrder = ['Anh', 'Trung', 'Pháp', 'Nhật', 'Hàn'];
      const languageCounts = { Anh: 0, Trung: 0, Pháp: 0, Nhật: 0, Hàn: 0 };

      const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const dbSkillKeys = {
        emergency_response: 'Ứng phó khẩn cấp',
        risk_communication: 'Truyền thông rủi ro',
        psycho_social: 'Tâm lý xã hội',
        data_management: 'Quản lý dữ liệu',
        epidemiology: 'Dịch tễ học',
        infection_control: 'Phòng chống nhiễm trùng',
        lab: 'Phòng thí nghiệm',
        logistics: 'Hậu cần khẩn cấp',
        operation_materials: 'Quản lý và vận hành',
        security_management: 'Quản lý ca bệnh/An ninh',
        food_management: 'Dinh dưỡng',
        wash_management: 'WASH',
      };

      const skillCounts = {
        'Trình độ ngoại ngữ': {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        },
      };
      Object.values(dbSkillKeys).forEach((skill) => {
        skillCounts[skill] = {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        };
      });

      // ==========================================
      // BƯỚC 2: QUÉT VÀ ĐẾM DỮ LIỆU
      // ==========================================
      filteredData.forEach((r) => {
        // 1. TÌM CHÍNH XÁC QUALIFICATION CỦA NGƯỜI NÀY BẰNG JAVASCRIPT
        const qual = allQuals.find((q) => q.profile_id === r.id) || {};

        // Giới tính & Trạng thái
        const gender = (r.gender || '').toLowerCase();
        if (gender === 'male' || gender === 'nam') genderCounts.Male++;
        else if (gender === 'female' || gender === 'nữ') genderCounts.Female++;

        const statusKey = (r.approval_status || 'pending').toLowerCase();
        if (statusCounts.hasOwnProperty(statusKey)) statusCounts[statusKey]++;

        // Chuyên môn & Cấp bậc
        const specRaw = (qual.specialty || r.academic || '')
          .trim()
          .toLowerCase();
        if (
          specRaw.includes('y khoa') ||
          specRaw.includes('điều dưỡng') ||
          specRaw.includes('dược')
        )
          academicCounts['Y khoa và Điều dưỡng']++;
        else if (specRaw.includes('công cộng'))
          academicCounts['Y tế công cộng']++;
        else if (specRaw.includes('kỹ thuật') || specRaw.includes('quản lý'))
          academicCounts['Kỹ thuật và Quản lý']++;

        const levelRaw = (qual.academic_level || r.academic_level || '')
          .trim()
          .toLowerCase();
        if (levelRaw.includes('trung cấp') || levelRaw.includes('cao đẳng'))
          academicLevelCounts['Trung cấp/Cao đẳng']++;
        else if (levelRaw === 'đại học') academicLevelCounts['Đại học']++;
        else if (
          levelRaw.includes('sau đại học') ||
          levelRaw.includes('thạc sĩ') ||
          levelRaw.includes('tiến sĩ')
        )
          academicLevelCounts['Sau Đại học']++;

        // Ngoại ngữ
        const languageRaw = (qual.languages || '').trim();
        if (languageRaw) {
          const capLang =
            languageRaw.charAt(0).toUpperCase() +
            languageRaw.slice(1).toLowerCase();
          if (languageCounts.hasOwnProperty(capLang)) languageCounts[capLang]++;
        }

        // Kỹ năng JSONB
        if (
          qual.languages_level &&
          levels.includes(qual.languages_level.toLowerCase())
        ) {
          skillCounts['Trình độ ngoại ngữ'][
            qual.languages_level.toLowerCase()
          ]++;
        }

        let skillsObj = {};
        if (qual.skills) {
          try {
            skillsObj =
              typeof qual.skills === 'string'
                ? JSON.parse(qual.skills)
                : qual.skills;
          } catch (e) {
            skillsObj = {};
          }
        }

        Object.entries(dbSkillKeys).forEach(([dbKey, viName]) => {
          const s = skillsObj[dbKey];
          if (
            s &&
            s.has_skill &&
            s.level &&
            levels.includes(s.level.toLowerCase())
          ) {
            skillCounts[viName][s.level.toLowerCase()]++;
          }
        });
      });

      // ==========================================
      // BƯỚC 3: VẼ BIỂU ĐỒ (KÈM BÁO LỖI NẾU TRỐNG)
      // ==========================================

      // Biểu đồ Giới tính
      const genderData = ['Male', 'Female'].map((g) => ({
        name: g,
        y: genderCounts[g],
        color: colors[g.toLowerCase()],
      }));
      if (genderData.some((d) => d.y > 0)) {
        Highcharts.chart('genderDistributionChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố thành viên theo giới tính' },
          series: [{ name: 'Số lượng', colorByPoint: true, data: genderData }],
          credits: { enabled: false },
        });
      } else {
        $('#genderDistributionChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu giới tính.</p>'
        );
      }

      // Biểu đồ Trạng thái
      const statusOrder = ['pending', 'edit', 'approved'];
      const statusData = statusOrder.map((s) => ({
        name: s,
        y: statusCounts[s],
        color: colors[s] || '#ccc',
      }));
      const totalMembers = Object.values(statusCounts).reduce(
        (a, b) => a + b,
        0
      );
      if (totalMembers > 0) {
        Highcharts.chart('statusDistributionChart', {
          chart: { type: 'column', backgroundColor: 'transparent' },
          title: { text: 'Tình trạng nhân sự RRT' },
          xAxis: { categories: [...statusOrder, 'Total'] },
          yAxis: { allowDecimals: false },
          legend: { enabled: false },
          series: [
            {
              name: 'Members',
              data: [
                ...statusData,
                { name: 'Total', y: totalMembers, color: '#03396c' },
              ],
              colorByPoint: true,
            },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#statusDistributionChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu trạng thái.</p>'
        );
      }

      // Biểu đồ Chuyên môn
      const academicData = [
        'Y khoa và Điều dưỡng',
        'Y tế công cộng',
        'Kỹ thuật và Quản lý',
      ].map((s, i) => ({
        name: s,
        y: academicCounts[s],
        color: colors[`academic${i + 1}`],
      }));
      if (academicData.some((d) => d.y > 0)) {
        Highcharts.chart('academicSpecializationChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo chuyên môn' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: academicData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#academicSpecializationChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu chuyên môn.</p>'
        );
      }

      // Biểu đồ Cấp bậc
      const academicLevelData = [
        'Trung cấp/Cao đẳng',
        'Đại học',
        'Sau Đại học',
      ].map((l, i) => ({
        name: l,
        y: academicLevelCounts[l],
        color: colors[`academicLevel${i + 1}`],
      }));
      if (academicLevelData.some((d) => d.y > 0)) {
        Highcharts.chart('academicLevelChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo trình độ học vấn' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: academicLevelData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#academicLevelChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu cấp bậc.</p>'
        );
      }

      // Biểu đồ Ngoại ngữ
      const languageData = languageOrder.map((l, i) => ({
        name: l,
        y: languageCounts[l],
        color: Highcharts.getOptions().colors[i] || '#ccc',
      }));
      if (languageData.some((d) => d.y > 0)) {
        Highcharts.chart('languageChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo ngoại ngữ' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: languageData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#languageChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu ngoại ngữ.</p>'
        );
      }

      // Biểu đồ Cấp bậc Kỹ năng & Bảng
      const chartCategories = Object.keys(skillCounts);
      const chartSeries = levels.map((level) => ({
        name: level.charAt(0).toUpperCase() + level.slice(1),
        data: chartCategories.map((skill) => skillCounts[skill][level]),
        color:
          colors[`level${level.charAt(0).toUpperCase() + level.slice(1)}`] ||
          '#cccccc',
      }));

      const hasAnySkillData = chartSeries.some((series) =>
        series.data.some((val) => val > 0)
      );

      if (hasAnySkillData) {
        Highcharts.chart('teamLevelChart', {
          chart: { type: 'column', backgroundColor: 'transparent' },
          title: { text: 'Phân bố trình độ kỹ năng' },
          xAxis: { categories: chartCategories },
          yAxis: { allowDecimals: false, stackLabels: { enabled: true } },
          plotOptions: { column: { stacking: 'normal', borderRadius: 3 } },
          series: chartSeries,
          credits: { enabled: false },
        });

        let tableHtml = `<h4 class="mt-4 analytics-subtitle">Bảng thống kê chi tiết</h4><div class="table-responsive"><table class="table table-striped table-bordered analytics-table"><thead class="table-warning"><tr><th>Kỹ năng</th><th>Cơ bản</th><th>Trung cấp</th><th>Nâng cao</th><th>Chuyên gia</th></tr></thead><tbody>`;
        Object.entries(skillCounts).forEach(([skill, counts]) => {
          if (levels.some((l) => counts[l] > 0)) {
            tableHtml += `<tr><td>${skill}</td><td>${counts.beginner}</td><td>${counts.intermediate}</td><td>${counts.advanced}</td><td>${counts.expert}</td></tr>`;
          }
        });
        tableHtml += '</tbody></table></div>';
        $('#detailedSummaryTable').html(tableHtml);
      } else {
        $('#teamLevelChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu về trình độ kỹ năng.</p>'
        );
        $('#detailedSummaryTable').html('');
      }

      // Bảng Tóm tắt
      const summaryData = {
        'Tổng số thành viên': filteredData.length,
        ...Object.fromEntries(
          statusOrder.map((cat) => [`Tình trạng: ${cat}`, statusCounts[cat]])
        ),
        ...Object.fromEntries(
          Object.keys(genderCounts).map((gender) => [
            `Giới tính: ${gender}`,
            genderCounts[gender],
          ])
        ),
      };
      let summaryHtml =
        '<h4 class="mt-4 analytics-subtitle">Tóm tắt thành viên</h4><div class="table-responsive"><table class="table table-hover table-bordered analytics-table"><thead class="table-secondary"><tr><th>Số liệu</th><th>Giá trị</th></tr></thead><tbody>';
      Object.entries(summaryData).forEach(([key, value]) => {
        summaryHtml += `<tr><td>${key}</td><td><strong>${value}</strong></td></tr>`;
      });
      summaryHtml += '</tbody></table></div>';
      $('#summaryTable').html(summaryHtml);
    } catch (error) {
      console.error('Lỗi renderAnalytics:', error);
      showToast('Đã xảy ra lỗi khi hiển thị phân tích.', 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // --- Giữ nguyên các hàm helper khác như animateCounters, loadRecentReportsAndTodos, updateRecentReportsTable, updateTodoList ---

  // --- Helper Functions for UI Updates (Client-side) ---

  function animateCounters() {
    $('.box-info h3').each(function () {
      const $this = $(this);
      const countTo = parseInt($this.text());
      $({ countNum: 0 }).animate(
        {
          countNum: countTo,
        },
        {
          duration: 1000,
          easing: 'swing',
          step: function () {
            $this.text(Math.floor(this.countNum));
          },
          complete: function () {
            $this.text(this.countNum);
          },
        }
      );
    });
  }

  function updateRecentReportsTable(reports) {
    const tbody = document.getElementById('recent-report-body');
    tbody.innerHTML = '';

    if (!reports || reports.length === 0) {
      // Nhớ đổi colspan thành 5 vì bảng giờ có 5 cột
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Không có hồ sơ gần đây.</td></tr>`;
      return;
    }

    reports.forEach((report) => {
      const row = document.createElement('tr');

      // Ánh xạ dữ liệu từ bảng profiles mới
      const name = report.full_name || 'Chưa cập nhật';
      const date = new Date(
        report.updated_at || report.created_at || Date.now()
      ).toLocaleDateString('vi-VN');
      const shortId = report.id ? String(report.id).substring(0, 8) : '';
      const status = report.approval_status || 'pending';

      // Tạo HTML cho 1 dòng dữ liệu
      row.innerHTML = `
            <td data-label="User"><b>${
              window.escapeHtml ? window.escapeHtml(name) : name
            }</b></td>
            <td data-label="Date" class="text-center">${date}</td>
            <td data-label="Report ID" class="text-center"><small class="text-muted">${shortId}...</small></td>
            <td data-label="Status" class="text-center">
                <span class="status ${getStatusClassClient(
                  status
                )}">${getStatusTextClient(status)}</span>
            </td>
            <td data-label="Action" class="text-center">
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-info text-white" onclick="viewReport('${
                      report.id
                    }')" title="Xem & Cập nhật">
                        <i class='bx bx-show-alt'></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" 
                    onclick="window.openEditModal('${report.id}')"
                            title="Yêu cầu chỉnh sửa">
                        <i class='bx bx-error'></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-success" 
                            onclick="approveReport('${report.id}')" 
                            title="Phê duyệt">
                        <i class='bx bx-check'></i>
                    </button>

                </div>
            </td>
        `;
      tbody.appendChild(row);
    });
  }
  function updateTodoList(todos) {
    const listContainer = document.getElementById('todo-list');
    listContainer.innerHTML = '';

    if (!todos || todos.length === 0) {
      listContainer.style.display = 'block';
      listContainer.innerHTML = `<li class="not-completed" style="list-style:none;"><p>Không có tác vụ nào</p></li>`;
      return;
    }

    // CHIA CỘT BẰNG CSS GRID
    listContainer.style.display = 'grid';
    listContainer.style.gridTemplateColumns =
      'repeat(auto-fit, minmax(250px, 1fr))';
    listContainer.style.gap = '20px';
    listContainer.style.padding = '0';

    // GOM NHÓM DỮ LIỆU
    const groups = todos.reduce(
      (acc, item) => {
        const status = item.approval_status || item.status || 'pending';
        const text = item.text || `Hồ sơ: ${item.full_name || 'Không tên'}`;
        const isDone = item.done || status === 'approved';
        const task = { text, done: isDone };

        if (status === 'pending') acc.pending.push(task);
        else if (status === 'edit') acc.edit.push(task);
        else acc.other.push(task);

        return acc;
      },
      { pending: [], edit: [], other: [] }
    );

    const columnsConfig = [
      {
        id: 'pending',
        title: '💡 Đang chờ phê duyệt',
        data: groups.pending,
        className: 'status-pending',
      },
      {
        id: 'edit',
        title: '🪔 Yêu cầu sửa đổi',
        data: groups.edit,
        className: 'status-edit',
      },
      { id: 'other', title: '✅ Đã xử lý', data: groups.other, className: '' },
    ];

    // RENDER CÁC CỘT
    columnsConfig.forEach((col) => {
      if (col.data.length === 0) return;

      // Khối bao bọc toàn bộ cột
      const colDiv = document.createElement('div');
      colDiv.className = 'todo-column';
      colDiv.style.background = 'var(--light)';
      colDiv.style.padding = '15px';
      colDiv.style.borderRadius = '12px';
      colDiv.style.listStyle = 'none';

      // ---------------------------------------------------------
      // 1. TẠO THANH TIÊU ĐỀ CÓ THỂ CLICK ĐỂ THU GỌN
      // ---------------------------------------------------------
      const headerWrapper = document.createElement('div');
      headerWrapper.style.display = 'flex';
      headerWrapper.style.justifyContent = 'space-between';
      headerWrapper.style.alignItems = 'center';
      headerWrapper.style.cursor = 'pointer'; // Hiển thị hình bàn tay khi hover
      headerWrapper.style.marginBottom = '15px';
      headerWrapper.style.userSelect = 'none'; // Chống bôi đen chữ khi click liên tục

      const headerTitle = document.createElement('h6');
      headerTitle.style.margin = '0';
      headerTitle.innerHTML = `<strong>${col.title}</strong> <span style="opacity: 0.6; font-size: 0.9em;">(${col.data.length})</span>`;

      // Thêm icon mũi tên (Sử dụng thư viện Boxicons của bạn)
      const toggleIcon = document.createElement('i');
      toggleIcon.className = 'bx bx-chevron-down';
      toggleIcon.style.fontSize = '24px';
      toggleIcon.style.transition = 'transform 0.3s ease'; // Hiệu ứng xoay mượt mà

      headerWrapper.appendChild(headerTitle);
      headerWrapper.appendChild(toggleIcon);
      colDiv.appendChild(headerWrapper);

      // ---------------------------------------------------------
      // 2. TẠO HỘP CHỨA TÁC VỤ VÀ ĐỔ DỮ LIỆU VÀO
      // ---------------------------------------------------------
      const tasksWrapper = document.createElement('div');

      col.data.forEach((todo) => {
        const taskCard = document.createElement('div');

        const taskClass =
          col.id === 'other'
            ? todo.done
              ? 'completed'
              : 'not-completed'
            : `not-completed ${col.className}`;

        taskCard.className = `task-card ${taskClass}`;
        taskCard.style.padding = '12px';
        taskCard.style.marginBottom = '10px';
        taskCard.style.backgroundColor = '#fff'; // Đổi nền thẻ thành trắng để nổi bật trên nền xám
        taskCard.style.borderRadius = '8px';
        taskCard.style.borderLeft = '4px solid var(--blue)';
        taskCard.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

        taskCard.innerHTML = `<p style="margin:0; font-size: 14px; font-weight: 500;">${todo.text}</p>`;
        tasksWrapper.appendChild(taskCard);
      });

      colDiv.appendChild(tasksWrapper);

      // ---------------------------------------------------------
      // 3. GẮN SỰ KIỆN CLICK ĐỂ ẨN/HIỆN
      // ---------------------------------------------------------
      let isCollapsed = false;
      headerWrapper.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
          tasksWrapper.style.display = 'none'; // Giấu các thẻ đi
          toggleIcon.style.transform = 'rotate(-90deg)'; // Xoay mũi tên hướng sang phải
        } else {
          tasksWrapper.style.display = 'block'; // Hiện lại các thẻ
          toggleIcon.style.transform = 'rotate(0deg)'; // Xoay mũi tên cắm xuống
        }
      });

      listContainer.appendChild(colDiv);
      if (col.id === 'other') {
        headerWrapper.click();
      }
    });
  }

  // Example function to get CSS class for status badges
  function getStatusBadgeClass(status) {
    switch (status.toLowerCase()) {
      case 'on duty':
        return 'approved';
      case 'off duty':
        return 'pending';
      case 'available':
        return 'pending';
      case 'deploy':
        return 'approved';
      default:
        return 'pending';
    }
  }

  const sectionMap = [
    'page-dashboard',
    'page-datatable',
    'page-roster',
    'page-emergency',
    'page-tracking',
    'page-team',
    'page-training',
    'page-logistics',
    'page-library',
    'page-map',
    'page-notification',
  ];
  const sideMenuItems = document.querySelectorAll('#sidebar .side-menu.top li');

  /**
   * Hàm hiển thị Section & Quản lý Polling (HOÀN CHỈNH)
   */
  window.showSectionById = async function (targetId) {
    // 1. Tắt poller cũ
    if (typeof stopDashboardPoller === 'function') stopDashboardPoller();
    if (typeof stopTrackingPoller === 'function') stopTrackingPoller();

    // 2. Cập nhật Sidebar UI
    document
      .querySelectorAll('#sidebar .side-menu li')
      .forEach((li) => li.classList.remove('active'));
    const activeLink = document.querySelector(
      `#sidebar .side-menu a[data-target="${targetId}"]`
    );
    if (activeLink) activeLink.parentElement.classList.add('active');

    // 3. Ẩn/Hiện trang
    const allPages = document.querySelectorAll('main > div[id^="page-"]');
    allPages.forEach((page) => (page.style.display = 'none'));

    const targetEl = document.getElementById(targetId);
    if (!targetEl) {
      console.error('Không tìm thấy trang ID:', targetId);
      return;
    }

    targetEl.style.display = 'block';

    // 4. Render nội dung (Sử dụng await cho các hàm async)
    switch (targetId) {
      case 'page-dashboard':
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof startDashboardPoller === 'function') startDashboardPoller();
        break;
      case 'page-map':
        // [QUAN TRỌNG] Dùng await ở đây vì renderMapPage là async
        await renderMapPage();
        break;
      case 'page-library':
        if (typeof renderLibraryPage === 'function') renderLibraryPage();
        break;
      case 'page-logistics':
        if (typeof renderLogisticsPage === 'function') renderLogisticsPage();
        break;
      case 'page-training':
        if (typeof renderTrainingPage === 'function') renderTrainingPage();
        break;
      case 'page-team':
        if (typeof renderTeamPage === 'function') renderTeamPage();
        break;

      // ... Các case khác giữ nguyên ...
      default:
        // Các trang đơn giản không cần async
        const renderFnName =
          'render' +
          targetId.replace('page-', '').charAt(0).toUpperCase() +
          targetId.replace('page-', '').slice(1) +
          'Page';
        if (typeof window[renderFnName] === 'function') window[renderFnName]();
        break;
    }
  };

  // --- XỬ LÝ CLICK MENU (SỬA LỖI LỆCH INDEX) ---
  const allSideMenuLinks = document.querySelectorAll(
    '#sidebar .side-menu.top li a'
  );

  allSideMenuLinks.forEach((link) => {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // 1. Lấy ID trang mục tiêu từ HTML
      const targetId = this.getAttribute('data-target');

      // 2. Xử lý Active class (Giao diện)
      const li = this.parentElement;
      document
        .querySelectorAll('#sidebar .side-menu.top li')
        .forEach((i) => i.classList.remove('active'));
      li.classList.add('active');

      // 3. Gọi hàm chuyển trang theo ID (Không dùng index nữa)
      showSectionById(targetId);
    });
  });

  // ============================================================
  // PAGE-DATATABLE
  // ============================================================
  /**
   * (ĐÃ TỐI ƯU VÀ SỬA LỖI SPINNER) Hiển thị bảng RRT Form từ dữ liệu bảng profiles
   */
  window.renderRRTTable = async function () {
    // Bật Loading nội bộ ngay từ đầu
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // =========================================================
      // 1. KIỂM TRA SESSION
      // =========================================================
      const { data: authData, error: authErr } =
        await window.supabaseClient.auth.getUser();

      if (authErr || !authData?.user) {
        console.warn('⚠️ User chưa đăng nhập.');
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      const currentUserId = authData.user.id;
      const isAdmin = window.isUserAdmin?.() || false;

      // =========================================================
      // 2. TẢI DỮ LIỆU TỪ SUPABASE - CHỈ LẤY CỘT CẦN THIẾT
      // =========================================================
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select(
          `
          id, email, full_name, phone, role, team, position,
          department, deployment_status, approval_status,
          updated_at, created_at
        `
        )
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // ✅ FIX: Dùng filterDataByRole với biến ĐÚNG (data, không phải profilesRes)
      const filteredProfiles = window.filterDataByRole(data || []);

      window.appState = window.appState || {};
      window.appState.profiles = filteredProfiles;
      const profilesData = filteredProfiles;

      console.log(
        `✅ Loaded ${profilesData.length} profiles (Admin: ${isAdmin})`
      );

      // =========================================================
      // 4. XỬ LÝ GIAO DIỆN BẢNG (DATATABLES)
      // =========================================================
      // Hủy DataTable cũ nếu tồn tại
      if (
        typeof window.dataTableInstance !== 'undefined' &&
        window.dataTableInstance
      ) {
        window.dataTableInstance.destroy();
        $('#report-table tbody').empty();
      }

      // Kiểm tra dữ liệu rỗng
      if (profilesData.length === 0) {
        $('#report-table tbody').html(
          '<tr><td colspan="10" class="text-center text-muted p-3">Chưa có hồ sơ RRT nào.</td></tr>'
        );
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      // Hàm tiện ích cho Status
      const getStatusUI = (status) => {
        let text = 'Chờ duyệt',
          badgeClass = 'bg-warning text-dark';
        if (status === 'approved') {
          text = 'Đã duyệt';
          badgeClass = 'bg-success';
        } else if (status === 'edit') {
          text = 'Yêu cầu sửa';
          badgeClass = 'bg-danger';
        }
        return { text, badgeClass };
      };

      // Chuẩn bị dữ liệu cho DataTables
      const dataForTable = profilesData.map((profile, i) => {
        const recordId = profile.id;
        const status = profile.approval_status || 'pending';
        const statusUI = getStatusUI(status);

        // === Cột Status ===
        const statusCol = isAdmin
          ? `
           <select class="form-select form-select-sm update-status" 
               data-report-id="${recordId}" 
               id="status-select-${recordId}" 
               name="status-select-${recordId}"
               onchange="window.updateApprovalStatus('${recordId}', this.value)">
               <option value="pending" ${
                 status === 'pending' ? 'selected' : ''
               }>Chờ duyệt</option>
               <option value="edit" ${
                 status === 'edit' ? 'selected' : ''
               }>Yêu cầu sửa</option>
               <option value="approved" ${
                 status === 'approved' ? 'selected' : ''
               }>Đã duyệt</option>
           </select>
          `
          : `<span class="badge ${statusUI.badgeClass}">${statusUI.text}</span>`;

        // === Cột Actions ===
        const actions = isAdmin
          ? `<div class="d-flex justify-content-around">
             <i class="bx bx-show bx-sm text-primary view-icon" onclick="viewReport('${recordId}')" style="cursor:pointer;" title="Xem/Sửa hồ sơ"></i>
             <i class="bx bx-trash bx-sm text-danger delete-report" onclick="window.deleteProfile('${recordId}', '${
              window.escapeHtml?.(profile.full_name) || profile.full_name
            }')" style="cursor:pointer;" title="Xóa"></i>
           </div>`
          : `<div class="text-center"><i class="bx bx-show bx-sm text-primary view-icon" onclick="viewReport('${recordId}')" style="cursor:pointer;" title="Xem hồ sơ"></i></div>`;

        // Xử lý an toàn các giá trị null/undefined
        const dateText =
          profile.updated_at || profile.created_at
            ? new Date(
                profile.updated_at || profile.created_at
              ).toLocaleDateString('vi-VN')
            : 'N/A';
        const nameText = profile.full_name || 'N/A';
        const deptText = profile.department || '';

        // === Trả về mảng dữ liệu cho hàng ===
        return [
          i + 1,
          `<small class="text-muted">${recordId.substring(0, 8)}...</small>`,
          dateText,
          `<b>${
            window.escapeHtml?.(nameText) || nameText
          }</b><br><small class="text-muted">${
            window.escapeHtml?.(deptText) || deptText
          }</small>`,
          profile.phone || 'N/A',
          statusCol,
          profile.deployment_status ||
            '<span class="badge bg-secondary">Chưa rõ</span>',
          profile.resume_url
            ? `<a href="${profile.resume_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class='bx bx-link'></i> Tệp</a>`
            : '<span class="text-muted small">Không có</span>',
          actions,
        ];
      });

      // Khởi tạo DataTable
      window.dataTableInstance = $('#report-table').DataTable({
        data: dataForTable,
        destroy: true,
        responsive: true,
        columns: [
          { title: 'TT', width: '3%' },
          { title: 'Mã RRT', width: '7%' },
          { title: 'Ngày cập nhật', width: '10%' },
          { title: 'Họ Tên / Đơn vị' },
          { title: 'Số điện thoại', width: '10%' },
          { title: 'Phê duyệt', width: '12%' },
          { title: 'Điều động', width: '10%' },
          {
            title: 'Đính kèm',
            width: '8%',
            orderable: false,
            className: 'text-center',
          },
          {
            title: 'Hành động',
            width: '8%',
            orderable: false,
            className: 'text-center',
          },
        ],
        dom: '<"dataTables_top d-flex justify-content-between align-items-center mb-3"Bf>rt<"dataTables_bottom d-flex justify-content-between mt-3"ip>',
        buttons: [
          { extend: 'copy', className: 'btn btn-sm btn-outline-secondary' },
          {
            extend: 'excel',
            className: 'btn btn-sm btn-outline-success',
            text: '<i class="bx bx-spreadsheet"></i> Excel',
          },
          {
            extend: 'print',
            className: 'btn btn-sm btn-outline-info',
            text: '<i class="bx bx-printer"></i> In',
          },
        ],
        language: {
          search: 'Tìm kiếm:',
          lengthMenu: 'Hiển thị _MENU_ dòng',
          info: 'Hiển thị _START_ đến _END_ của _TOTAL_ hồ sơ',
          paginate: {
            first: 'Đầu',
            last: 'Cuối',
            next: 'Sau',
            previous: 'Trước',
          },
        },
      });
    } catch (err) {
      console.error('Lỗi khi lấy dữ liệu hồ sơ hoặc khởi tạo bảng:', err);
      if (typeof showToast === 'function') {
        showToast('Không thể tải danh sách hồ sơ: ' + err.message, 'error');
      }
    } finally {
      // Luôn luôn tắt vòng xoay loading ở cuối cùng
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // --- HÀM PHỤ TRỢ: Cập nhật Trạng thái phê duyệt ---
  window.updateApprovalStatus = async function (id, newStatus) {
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ approval_status: newStatus })
        .eq('id', id);

      if (error) throw error;
      showToast('Đã cập nhật trạng thái hồ sơ.', 'success');
    } catch (err) {
      console.error('Lỗi cập nhật status:', err);
      showToast('Lỗi cập nhật: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // =========================
  // PAGE-TEAM (Tự chủ dữ liệu Supabase)
  // =========================
  // ==========================================
  // BIẾN TOÀN CỤC VÀ HÀM LỌC DATATABLE
  // ==========================================
  let dataTableInstance = null;
  let teamAndDateFilterFn = null;

  function applyTeamAndDateFilter(selectedTeams, startDate, endDate) {
    // Xóa bộ lọc cũ để tránh bị đè
    if (teamAndDateFilterFn) {
      const idx = $.fn.dataTable.ext.search.indexOf(teamAndDateFilterFn);
      if (idx > -1) $.fn.dataTable.ext.search.splice(idx, 1);
    }

    const isTeamFiltering =
      selectedTeams &&
      selectedTeams.length > 0 &&
      !selectedTeams.includes('all');
    const isDateFiltering = startDate || endDate;

    if (!isTeamFiltering && !isDateFiltering) {
      if (dataTableInstance) dataTableInstance.draw();
      return;
    }

    // Đổi ngày thành timestamp để so sánh chuẩn xác
    const from = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : 0;
    const to = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;

    teamAndDateFilterFn = function (settings, data, dataIndex) {
      if (settings.nTable.id !== 'team-table') return true;

      // 1. LỌC TEAM (Nằm ở cột số 7 - tính từ 0)
      let passTeam = true;
      if (isTeamFiltering) {
        const teamHTML = data[7];
        const $div = $('<div>').html(teamHTML);
        const teamText =
          $div.find('select').val() || $div.text().trim() || 'No team';
        passTeam = selectedTeams.includes(teamText);
      }

      // 2. LỌC NGÀY (Nằm ở cột số 5)
      let passDate = true;
      if (isDateFiltering) {
        const row = settings.aoData[dataIndex];
        const dateStr = row?._aData?.[5];
        if (!dateStr) return false;

        // Quét định dạng dd/mm/yyyy
        const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) passDate = false;
        else {
          const rowTime = new Date(
            +match[3],
            +match[2] - 1,
            +match[1]
          ).getTime();
          passDate = rowTime >= from && rowTime <= to;
        }
      }

      return passTeam && passDate;
    };

    $.fn.dataTable.ext.search.push(teamAndDateFilterFn);
    if (dataTableInstance) dataTableInstance.draw();
  }
  // ==========================================
  // GẮN SỰ KIỆN CHO CÁC NÚT LỌC VÀ CẬP NHẬT
  // ==========================================

  // 1. Nút Lọc (Team + Date)
  $('#btn-filter-team')
    .off('click')
    .on('click', function () {
      const startDate = $('#filter-date-start-team').val();
      const endDate = $('#filter-date-end-team').val();
      const selectedTeams = $('#filter-team-select').val() || [];

      // Lọc bảng
      applyTeamAndDateFilter(selectedTeams, startDate, endDate);

      // Lọc biểu đồ (Dùng dữ liệu từ appState)
      let chartData = window.appState.teamData || [];
      if (selectedTeams.length > 0 && !selectedTeams.includes('all')) {
        chartData = chartData.filter((m) =>
          selectedTeams.includes(m.team || 'No team')
        );
      }
      // Gọi lại hàm vẽ biểu đồ với data đã lọc
      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(chartData, startDate, endDate, selectedTeams);
      }
    });

  // 2. Nút Xóa Lọc
  $('#btn-clear-filter-team, #btn-clear-team-filter')
    .off('click')
    .on('click', function () {
      $('#filter-date-start-team').val('');
      $('#filter-date-end-team').val('');
      $('#filter-team-select').val('all').trigger('change'); // trigger để select2 (nếu có) update

      applyTeamAndDateFilter([], null, null);

      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(window.appState.teamData || [], null, null);
      }
    });

  // 3. Nút So Sánh (Thực chất là kích hoạt lại Lọc)
  $('#btn-compare-teams')
    .off('click')
    .on('click', function () {
      $('#btn-filter-team').click();
    });

  // ------------------------------------------
  // CẬP NHẬT ĐỘI & VỊ TRÍ TRỰC TIẾP TRÊN BẢNG
  // ------------------------------------------
  $('#team-table').off('change', '.update-team, .update-position');
  $('#team-table').on('change', '.update-team, .update-position', function () {
    const $tr = $(this).closest('tr');

    // ĐÃ FIX: Lấy data-id thay vì data-username
    const userId = $(this).data('id') || $tr.find('.update-team').data('id');

    const newTeam = $tr.find('.update-team').val() || '';
    const newPos = $tr.find('.update-position').val() || '';

    if (typeof updateTeamData === 'function') {
      updateTeamData(userId, newTeam, newPos, $tr, dataTableInstance);
    }
  });
  // Cầu nối giúp menu sidebar nhận diện được trang Team
  window.renderTeamPage = function () {
    if (typeof window.renderTeamTable === 'function') window.renderTeamTable();
  };
  // =========================
  // RENDER TABLE + TẢI DỮ LIỆU TỪ SUPABASE (BẢN AN TOÀN TUYỆT ĐỐI)
  // =========================
  window.renderTeamTable = async function () {
    console.log('🚀 Bắt đầu tải trang Team...');
    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      // 1. Kéo dữ liệu từ Supabase
      const [profilesRes, qualRes] = await Promise.all([
        supabaseClient.from('profiles').select('*'),
        supabaseClient.from('rrt_qualifications').select('*'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      const fullTeamData = profilesRes.data || [];
      const allQuals = qualRes.data || [];

      console.log('✅ Đã kéo dữ liệu từ DB:', fullTeamData.length, 'người.');

      window.appState = window.appState || {};
      window.appState.teamData = fullTeamData;

      if (fullTeamData.length === 0) {
        $('#team-table tbody').html(
          "<tr><td colspan='9' class='text-center'>Chưa có dữ liệu đội.</td></tr>"
        );
        return;
      }

      // --- HÀM TIỆN ÍCH AN TOÀN ---
      const safeEscapeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(
          /[&<>'"]/g,
          (match) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              "'": '&#39;',
              '"': '&quot;',
            }[match])
        );
      };

      const isAdmin = window.userSession?.role?.toLowerCase().includes('admin');

      // 2. Chế biến dữ liệu cho DataTable
      const dataForTable = fullTeamData.map((r, i) => {
        const qual = allQuals.find((q) => q.profile_id === r.id) || {};
        r.qualifications = qual; // Đính kèm để dùng sau này nếu cần

        const teamCell = isAdmin
          ? `<span class="team-hidden" style="display:none">${safeEscapeHtml(
              r.team || 'No team'
            )}</span>
             <select class="form-select form-select-sm update-team" data-id="${
               r.id
             }">
               <option value="No team" ${
                 !r.team || r.team === 'No team' ? 'selected' : ''
               }>Chưa có đội</option>
               ${Array.from({ length: 10 }, (_, n) => n + 1)
                 .map(
                   (n) =>
                     `<option value="Team ${n}" ${
                       r.team === `Team ${n}` ? 'selected' : ''
                     }>Team ${n}</option>`
                 )
                 .join('')}
             </select>`
          : safeEscapeHtml(r.team || 'Chưa có đội');

        const posCell = isAdmin
          ? `<select class="form-select form-select-sm update-position" data-id="${
              r.id
            }">
               <option value="No position" ${
                 !r.position || r.position === 'No position' ? 'selected' : ''
               }>Chưa có vị trí</option>
               <option value="Leader" ${
                 r.position === 'Leader' ? 'selected' : ''
               }>Đội trưởng</option>
               <option value="Epidemic" ${
                 r.position === 'Epidemic' ? 'selected' : ''
               }>Cán bộ Dịch tễ</option>
               <option value="Member" ${
                 r.position === 'Member' ? 'selected' : ''
               }>Cán bộ Lấy mẫu</option>
               <option value="Engineer" ${
                 r.position === 'Engineer' ? 'selected' : ''
               }>Cán bộ Xử lý môi trường</option>
               <option value="Media" ${
                 r.position === 'Media' ? 'selected' : ''
               }>Cán bộ Truyền thông</option>
               <option value="Logistic" ${
                 r.position === 'Logistic' ? 'selected' : ''
               }>Hậu cần</option>
               <option value="Driver" ${
                 r.position === 'Driver' ? 'selected' : ''
               }>Lái xe</option>
             </select>`
          : safeEscapeHtml(r.position || 'Chưa có vị trí');

        // BỌC THÉP HÀM TÍNH ĐIỂM (Chống sập bảng nếu code cũ bị lỗi)
        let rankHtml = '<span class="badge bg-secondary">N/A</span>';
        try {
          if (typeof window.calculateRRTLevel === 'function') {
            rankHtml = window.calculateRRTLevel(r);
          }
        } catch (e) {
          console.warn('Lỗi tính Xếp hạng cho', r.full_name, e);
        }

        const regDate =
          r.updated_at || r.created_at
            ? new Date(r.updated_at || r.created_at).toLocaleDateString('vi-VN')
            : '';

        return [
          i + 1,
          safeEscapeHtml(r.full_name || 'N/A'),
          rankHtml,
          safeEscapeHtml(r.department || ''),
          safeEscapeHtml(r.phone || ''),
          regDate,
          safeEscapeHtml(r.email || ''),
          teamCell,
          posCell,
        ];
      });

      console.log('✅ Đã xử lý xong dữ liệu, bắt đầu vẽ bảng...');

      // 3. Xóa bảng cũ và Vẽ DataTable mới
      if ($.fn.DataTable.isDataTable('#team-table')) {
        $('#team-table').DataTable().clear().destroy();
        // Không dùng .empty() ở đây vì DataTables cần giữ lại cấu trúc thead nếu có
      }

      dataTableInstance = $('#team-table').DataTable({
        data: dataForTable,
        destroy: true,
        responsive: true,
        columns: [
          { title: 'TT', width: '3%' },
          { title: 'Họ Tên', width: '15%' },
          { title: 'Xếp hạng', width: '10%' },
          { title: 'Khoa phòng', width: '15%' },
          { title: 'Số điện thoại', width: '10%' },
          { title: 'Ngày cập nhật', width: '10%' },
          { title: 'Email', width: '12%' },
          { title: 'Đội', width: '10%' },
          { title: 'Vị trí', width: '15%' },
        ],
        columnDefs: [
          {
            targets: 5,
            render: function (data, type) {
              if (type === 'sort' || type === 'filter') {
                if (!data) return 0;
                const parts = String(data).split('/');
                if (parts.length !== 3) return 0;
                return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
              }
              return data || '';
            },
          },
          {
            targets: 7,
            render: function (data, type) {
              if (type === 'filter' || type === 'sort') {
                const matchHidden = String(data).match(
                  /<span[^>]*>(.*?)<\/span>/
                );
                if (matchHidden) return matchHidden[1].trim();
                return $('<div>').html(data).text().trim();
              }
              return data;
            },
          },
        ],
        dom: '<"dataTables_top"Blf>rt<"dataTables_bottom"ip>',
        buttons: [
          'copy',
          'csv',
          'excel',
          'pdf',
          'print',
          { extend: 'colvis', text: 'Columns' },
        ],
      });

      console.log('✅ Bảng DataTable đã vẽ thành công!');

      // 4. Vẽ lại các biểu đồ bên dưới
      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(fullTeamData, null, null);
      }

      // 5. Gắn sự kiện (Event Listener) Cập nhật đội
      $('#team-table').off('change', '.update-team, .update-position');
      $('#team-table').on(
        'change',
        '.update-team, .update-position',
        function () {
          const $tr = $(this).closest('tr');
          // Vì class gắn trực tiếp trên thẻ select, ta gọi $(this).data('id') luôn cho an toàn
          const userId = $(this).data('id');
          const newTeam = $tr.find('.update-team').val() || '';
          const newPos = $tr.find('.update-position').val() || '';

          if (typeof updateTeamData === 'function') {
            updateTeamData(userId, newTeam, newPos, $tr, dataTableInstance);
          }
        }
      );
    } catch (err) {
      console.error('❌ Lỗi chết hàm renderTeamTable:', err);
      showToast('Lỗi hiển thị bảng Đội. Xem F12 để biết chi tiết.', 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // ==========================================
  // CẬP NHẬT THÔNG TIN ĐỘI (GỌI TRỰC TIẾP ID LÊN SUPABASE)
  // ==========================================
  async function updateTeamData(userId, newTeam, newPosition, $tr, table) {
    if (!userId) return;

    try {
      // Dùng Khóa chính 'id' để update sẽ an toàn 100%
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          team: newTeam,
          position: newPosition,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      // Update Local State để biểu đồ nhảy theo
      if (window.appState && window.appState.teamData) {
        const member = window.appState.teamData.find((m) => m.id === userId);
        if (member) {
          member.team = newTeam;
          member.position = newPosition;
        }
      }

      // Update lại giao diện DataTable
      if (table && $tr.length) {
        const rowData = table.row($tr).data();
        if (rowData) {
          // Xây dựng lại HTML cho Cột 7 (Team)
          let teamOptions = `<option value="No team" ${
            newTeam === 'No team' ? 'selected' : ''
          }>Chưa có đội</option>`;
          for (let n = 1; n <= 10; n++) {
            teamOptions += `<option value="Team ${n}" ${
              newTeam === `Team ${n}` ? 'selected' : ''
            }>Team ${n}</option>`;
          }
          rowData[7] = `<span class="team-hidden" style="display:none">${window.escapeHtml(
            newTeam
          )}</span>
                        <select class="form-select form-select-sm update-team" data-id="${userId}">${teamOptions}</select>`;

          // Xây dựng lại HTML cho Cột 8 (Position)
          const posMap = {
            'No position': 'Chưa có vị trí',
            Leader: 'Đội trưởng',
            Epidemic: 'Cán bộ Dịch tễ',
            Member: 'Cán bộ Lấy mẫu',
            Engineer: 'Cán bộ Xử lý môi trường',
            Media: 'Cán bộ Truyền thông',
            Logistic: 'Hậu cần',
            Driver: 'Lái xe',
          };
          let posOptions = '';
          for (const [key, label] of Object.entries(posMap)) {
            posOptions += `<option value="${key}" ${
              newPosition === key ? 'selected' : ''
            }>${label}</option>`;
          }
          rowData[8] = `<select class="form-select form-select-sm update-position" data-id="${userId}">${posOptions}</select>`;

          table.row($tr).data(rowData).invalidate();
        }
      }

      // Vẽ lại biểu đồ phân tích bên dưới
      if (typeof renderAnalytics_Member === 'function') {
        const startDate = $('#filter-date-start-team').val();
        const endDate = $('#filter-date-end-team').val();
        const selectedTeams = $('#filter-team-select').val() || [];
        renderAnalytics_Member(
          window.appState.teamData,
          startDate,
          endDate,
          selectedTeams
        );
      }

      showToast('Đã phân công Đội thành công!', 'success');
    } catch (err) {
      console.error('Lỗi cập nhật Đội:', err);
      showToast('Lỗi khi phân công: ' + err.message, 'error');
    }
  }
  /**
   * (ĐÃ SỬA LỖI LỌC NGÀY BIỂU ĐỒ)
   * Hàm này sẽ nhận dữ liệu (đã lọc team) VÀ tự lọc theo ngày
   */

  // === BIẾN MÀU (colors) - BẮT BUỘC ĐỊNH NGHĨA TRƯỚC KHI GỌI HÀM ===
  const colors = {
    male: '#36a2eb',
    female: '#ff6384',
    pending: '#ffc107',
    edit: '#fd7e14',
    approved: '#28a745',
    academic1: '#4bc0c0',
    academic2: '#9966ff',
    academic3: '#ff9f40',
    academicOther: '#c9cbcf',
    academicLevel1: '#ffcd56',
    academicLevel2: '#4bc0c0',
    academicLevel3: '#36a2eb',
    levelBeginner: '#ff9f40',
    levelIntermediate: '#ffcd56',
    levelAdvanced: '#4bc0c0',
    levelExpert: '#36a2eb',
  };

  const academicLevelColorMap = {
    'Trung cấp/Cao đẳng': 'academicLevel1',
    'Đại học': 'academicLevel2',
    'Sau Đại học': 'academicLevel3',
  };

  // === HÀM CHÍNH: renderAnalytics_Member (SO SÁNH NHIỀU TEAM - ĐÃ NÂNG CẤP SUPABASE) ===
  window.renderAnalytics_Member = function (
    data,
    startDate,
    endDate,
    selectedTeams = []
  ) {
    try {
      if (!data || data.length === 0)
        throw new Error('Không có dữ liệu đầu vào');

      // === 1. LỌC THEO NGÀY (Dùng updated_at của Supabase) ===
      const fromDate = startDate ? new Date(startDate) : null;
      const toDate = endDate ? new Date(endDate) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(23, 59, 59, 999);

      let filtered = data;
      if (fromDate || toDate) {
        filtered = data.filter((m) => {
          const d = new Date(m.updated_at || m.created_at);
          if (isNaN(d)) return false;
          return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
        });
      }

      // === 2. LỌC THEO TEAM ===
      if (selectedTeams.length > 0 && !selectedTeams.includes('all')) {
        filtered = filtered.filter((m) =>
          selectedTeams.includes(m.team || 'No team')
        );
      }

      // === 3. LẤY DANH SÁCH TEAM DUY NHẤT ===
      const teams = [
        ...new Set(filtered.map((m) => m.team || 'No team')),
      ].sort();
      if (teams.length === 0) teams.push('No team');

      // === 4. HIGHCHARTS FONT ===
      if (typeof Highcharts !== 'undefined') {
        Highcharts.setOptions({
          chart: { style: { fontFamily: "'Ubuntu', sans-serif" } },
        });
      }

      // === HELPER: TẠO DỮ LIỆU THEO TEAM ===
      const groupByTeam = (keyFn, valueFn = () => 1) => {
        const result = {};
        teams.forEach((t) => (result[t] = {}));
        filtered.forEach((m) => {
          const team = m.team || 'No team';
          const key = keyFn(m);
          if (key)
            result[team][key] = (result[team][key] || 0) + (valueFn(m) || 1);
        });
        return result;
      };

      // === 1. BIỂU ĐỒ SỐ LƯỢNG THÀNH VIÊN ===
      const teamMemberCount = {};
      teams.forEach(
        (t) =>
          (teamMemberCount[t] = filtered.filter(
            (m) => (m.team || 'No team') === t
          ).length)
      );

      renderGroupedColumn('teamComparisonChartAP', {
        title: 'Số lượng thành viên theo Đội',
        categories: teams,
        series: [
          {
            name: 'Thành viên',
            data: teams.map((t) => teamMemberCount[t]),
            color: '#36a2eb',
          },
        ],
      });

      // === 2. GIỚI TÍNH ===
      const genderData = groupByTeam((m) => {
        const g = (m.gender || '').toLowerCase();
        return g === 'male' || g === 'nam'
          ? 'Male'
          : g === 'female' || g === 'nữ'
          ? 'Female'
          : null;
      });
      const genderSeries = ['Male', 'Female'].map((g) => ({
        name: g,
        data: teams.map((t) => genderData[t][g] || 0),
        color: colors[g.toLowerCase()],
      }));
      renderGroupedColumn('genderDistributionChartAP', {
        title: 'Giới tính theo Đội',
        categories: teams,
        series: genderSeries,
      });

      // === 3. TRẠNG THÁI (Đổi thành approval_status) ===
      const statusOrder = ['pending', 'edit', 'approved'];
      const statusData = groupByTeam((m) =>
        (m.approval_status || 'pending').toLowerCase()
      );
      const statusSeries = statusOrder.map((s) => ({
        name: s,
        data: teams.map((t) => statusData[t][s] || 0),
        color: colors[s] || '#cccccc',
      }));
      renderGroupedColumn('statusDistributionChartAP', {
        title: 'Tình trạng theo Đội',
        categories: teams,
        series: statusSeries,
      });

      // === 4. CHUYÊN NGÀNH (Đọc từ qualifications) ===
      const academicData = groupByTeam((m) => {
        const specRaw = (m.qualifications?.specialty || m.academic || '')
          .trim()
          .toLowerCase();
        if (
          specRaw.includes('y khoa') ||
          specRaw.includes('điều dưỡng') ||
          specRaw.includes('dược')
        )
          return 'Y khoa và Điều dưỡng';
        if (specRaw.includes('công cộng')) return 'Y tế công cộng';
        if (specRaw.includes('kỹ thuật') || specRaw.includes('quản lý'))
          return 'Kỹ thuật và Quản lý';
        return null;
      });
      const academicSeries = [
        'Y khoa và Điều dưỡng',
        'Y tế công cộng',
        'Kỹ thuật và Quản lý',
      ].map((s, i) => ({
        name: s,
        data: teams.map((t) => academicData[t][s] || 0),
        color: colors[`academic${i + 1}`] || '#cccccc',
      }));
      renderGroupedColumn('academicSpecializationChartAP', {
        title: 'Chuyên ngành theo Đội',
        categories: teams,
        series: academicSeries,
      });

      // === 5. CẤP BẬC HỌC VẤN ===
      const levelData = groupByTeam((m) => {
        const levelRaw = (
          m.qualifications?.academic_level ||
          m.academic_level ||
          ''
        )
          .trim()
          .toLowerCase();
        if (levelRaw.includes('trung cấp') || levelRaw.includes('cao đẳng'))
          return 'Trung cấp/Cao đẳng';
        if (levelRaw === 'đại học') return 'Đại học';
        if (
          levelRaw.includes('sau đại học') ||
          levelRaw.includes('thạc sĩ') ||
          levelRaw.includes('tiến sĩ')
        )
          return 'Sau Đại học';
        return null;
      });
      const levelSeries = ['Trung cấp/Cao đẳng', 'Đại học', 'Sau Đại học'].map(
        (l) => ({
          name: l,
          data: teams.map((t) => levelData[t][l] || 0),
          color: colors[academicLevelColorMap[l]] || '#cccccc',
        })
      );
      renderGroupedColumn('academicLevelChartAP', {
        title: 'Trình độ học vấn theo Đội',
        categories: teams,
        series: levelSeries,
      });

      // === 6. NGOẠI NGỮ ===
      const langOrder = ['Anh', 'Trung', 'Pháp', 'Nhật', 'Hàn'];
      const langData = groupByTeam((m) => {
        const l = (m.qualifications?.languages || m.language || '')
          .toString()
          .trim();
        return l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : null;
      });
      const langSeries = langOrder.map((l, i) => ({
        name: l,
        data: teams.map((t) => langData[t][l] || 0),
        color: Highcharts.getOptions().colors[i] || '#cccccc',
      }));
      renderGroupedColumn('languageChartAP', {
        title: 'Ngoại ngữ theo Đội',
        categories: teams,
        series: langSeries,
      });

      // === 7. KỸ NĂNG (BÓC TÁCH TỪ JSONB QUALIFICATIONS) ===
      const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const dbSkillKeys = {
        emergency_response: 'Ứng phó khẩn cấp',
        risk_communication: 'Truyền thông rủi ro',
        psycho_social: 'Tâm lý xã hội',
        data_management: 'Quản lý dữ liệu',
        epidemiology: 'Dịch tễ học',
        infection_control: 'Phòng chống nhiễm trùng',
        lab: 'Phòng thí nghiệm',
        logistics: 'Hậu cần khẩn cấp',
        operation_materials: 'Quản lý và vận hành',
        security_management: 'Quản lý ca bệnh/An ninh',
        food_management: 'Dinh dưỡng',
        wash_management: 'WASH',
      };

      const skillData = {};
      Object.values(dbSkillKeys).forEach((s) => (skillData[s] = {}));
      skillData['Trình độ ngoại ngữ'] = {};

      teams.forEach((t) => {
        Object.values(dbSkillKeys).forEach(
          (s) =>
            (skillData[s][t] = {
              beginner: 0,
              intermediate: 0,
              advanced: 0,
              expert: 0,
            })
        );
        skillData['Trình độ ngoại ngữ'][t] = {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        };
      });

      filtered.forEach((m) => {
        const team = m.team || 'No team';
        const qual = m.qualifications || {};

        // Quét trình độ ngoại ngữ
        if (
          qual.languages_level &&
          levels.includes(qual.languages_level.toLowerCase())
        ) {
          skillData['Trình độ ngoại ngữ'][team][
            qual.languages_level.toLowerCase()
          ]++;
        }

        // Quét JSON kỹ năng
        let skillsObj = {};
        if (qual.skills) {
          try {
            skillsObj =
              typeof qual.skills === 'string'
                ? JSON.parse(qual.skills)
                : qual.skills;
          } catch (e) {
            skillsObj = {};
          }
        }

        Object.entries(dbSkillKeys).forEach(([dbKey, viName]) => {
          const s = skillsObj[dbKey];
          if (
            s &&
            s.has_skill &&
            s.level &&
            levels.includes(s.level.toLowerCase())
          ) {
            skillData[viName][team][s.level.toLowerCase()]++;
          }
        });
      });

      const skillCategories = [
        'Trình độ ngoại ngữ',
        ...Object.values(dbSkillKeys),
      ];
      const skillSeries = levels.map((l) => ({
        name: l.charAt(0).toUpperCase() + l.slice(1),
        data: skillCategories.map((skill) => {
          let total = 0;
          teams.forEach((t) => (total += skillData[skill][t]?.[l] || 0));
          return total;
        }),
        color:
          colors[`level${l.charAt(0).toUpperCase() + l.slice(1)}`] || '#cccccc',
      }));

      renderStackedColumn('teamLevelChartAP', {
        title: 'Kỹ năng theo Đội',
        categories: skillCategories,
        series: skillSeries,
      });

      // === 8. BẢNG CHI TIẾT KỸ NĂNG ===
      let tableHtml = `<h4 class="mt-4 analytics-subtitle">Chi tiết kỹ năng theo Team</h4><div class="table-responsive">`;

      skillCategories.forEach((skillName) => {
        const skillTeamData = skillData[skillName];
        const hasData = teams.some((t) =>
          Object.values(skillTeamData[t]).some((v) => v > 0)
        );

        if (!hasData) return; // Bỏ qua kỹ năng không ai có

        tableHtml += `
      <div class="skill-section mb-4 p-3 border rounded shadow-sm" style="background:#f8f9fa;">
        <h5 class="skill-title mb-3 d-flex align-items-center">
          <i class="bx-iconsax-lin-profile me-2 text-primary"></i><strong>${skillName}</strong>
        </h5>
        <table class="table table-sm table-bordered table-hover analytics-table skill-table">
          <thead class="table-light">
            <tr>
              <th class="text-center">Đội</th>
              <th class="text-center text-warning">Cơ bản</th>
              <th class="text-center text-info">Trung cấp</th>
              <th class="text-center text-success">Nâng cao</th>
              <th class="text-center text-danger">Chuyên gia</th>
            </tr>
          </thead>
          <tbody>`;

        teams.forEach((team) => {
          const d = skillTeamData[team];
          if (d.beginner + d.intermediate + d.advanced + d.expert === 0) return;
          tableHtml += `
          <tr>
            <td class="fw-bold text-dark">${team}</td>
            <td class="text-center ${
              d.beginner > 0 ? 'bg-warning-subtle fw-bold' : ''
            }">${d.beginner || '-'}</td>
            <td class="text-center ${
              d.intermediate > 0 ? 'bg-info-subtle fw-bold' : ''
            }">${d.intermediate || '-'}</td>
            <td class="text-center ${
              d.advanced > 0 ? 'bg-success-subtle fw-bold' : ''
            }">${d.advanced || '-'}</td>
            <td class="text-center ${
              d.expert > 0 ? 'bg-danger-subtle text-white fw-bold' : ''
            }">${d.expert || '-'}</td>
          </tr>`;
        });
        tableHtml += `</tbody></table></div>`;
      });
      tableHtml += `</div>`;
      $('#detailedSummaryTableAP').html(
        tableHtml ||
          '<p class="no-data-message mt-4">Không có dữ liệu kỹ năng.</p>'
      );

      // === 9. BẢNG TÓM TẮT ===
      const summary = { 'Tổng số thành viên': filtered.length };
      teams.forEach(
        (t) =>
          (summary[`Team: ${t}`] = filtered.filter(
            (m) => (m.team || 'No team') === t
          ).length)
      );

      let summaryHtml =
        '<h4 class="mt-4 analytics-subtitle">Tóm tắt Đội</h4><div class="table-responsive"><table class="table table-hover analytics-table"><thead class="table-secondary"><tr><th>Số liệu</th><th>Giá trị</th></tr></thead><tbody>';
      Object.entries(summary).forEach(
        ([k, v]) =>
          (summaryHtml += `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`)
      );
      summaryHtml += '</tbody></table></div>';
      $('#summaryTableAP').html(summaryHtml);

      // Cập nhật biểu đồ Năng lực tổng hợp (Nếu có hàm)
      if (
        document.getElementById('competencyChartAP') &&
        typeof renderCompetencyChart === 'function'
      ) {
        renderCompetencyChart(filtered);
      }
    } catch (error) {
      console.error('renderAnalytics_Member error:', error);
      const ids = [
        'teamComparisonChartAP',
        'genderDistributionChartAP',
        'statusDistributionChartAP',
        'academicSpecializationChartAP',
        'academicLevelChartAP',
        'languageChartAP',
        'teamLevelChartAP',
      ];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el)
          el.innerHTML =
            '<p class="no-data-message text-center">Chưa có dữ liệu để vẽ biểu đồ.</p>';
      });
      $('#detailedSummaryTableAP, #summaryTableAP').html(
        '<p class="no-data-message text-center">Chưa có dữ liệu.</p>'
      );
    }
  };

  // Hàm vẽ biểu đồ thống kê Đào tạo
  function renderTrainingAnalytics() {
    if (typeof Highcharts === 'undefined') return;

    const records = window.appState.training?.records || [];
    const profilesMap = window.appState.training?.profilesMap || {}; // ✅ Map profile_id → team

    // --- 1. Xử lý dữ liệu Kết quả (Pie Chart) ---
    let countPass = 0;
    let countFail = 0;
    let countPending = 0;

    records.forEach((r) => {
      if (r.result === 'pass') countPass++;
      else if (r.result === 'fail') countFail++;
      else countPending++;
    });

    // Vẽ Pie Chart
    if (document.getElementById('trainingResultChart')) {
      Highcharts.chart('trainingResultChart', {
        chart: {
          type: 'pie',
          backgroundColor: 'transparent',
          style: { fontFamily: "'Ubuntu', sans-serif" },
        },
        title: { text: null },
        tooltip: {
          pointFormat: '<b>{point.y}</b> học viên ({point.percentage:.1f}%)',
        },
        plotOptions: {
          pie: {
            innerSize: '50%',
            dataLabels: { enabled: false },
            showInLegend: true,
          },
        },
        series: [
          {
            name: 'Số lượng',
            colorByPoint: true,
            data: [
              { name: 'Đạt', y: countPass, color: '#28a745' },
              { name: 'Chưa đạt', y: countFail, color: '#dc3545' },
              { name: 'Chờ kết quả', y: countPending, color: '#ffc107' },
            ],
          },
        ],
        credits: { enabled: false },
        legend: { itemStyle: { fontSize: '11px' } },
      });
    }

    // --- 2. Xử lý dữ liệu theo Team (Bar Chart) - FIX ---
    const teamCounts = {};

    records.forEach((r) => {
      if (
        r.attendance === true ||
        r.attendance === 'TRUE' ||
        r.attendance === 'true'
      ) {
        // ✅ Lấy team từ profilesMap thay vì teamData
        const profileId = r.profile_id || r.user_id;
        const profileData = profilesMap[profileId];
        const teamName = profileData?.team || 'Chưa phân loại';

        teamCounts[teamName] = (teamCounts[teamName] || 0) + 1;
      }
    });

    // Sắp xếp Team
    const sortedTeams = Object.keys(teamCounts).sort(
      (a, b) => teamCounts[b] - teamCounts[a]
    );
    const dataSeries = sortedTeams.map((t) => teamCounts[t]);

    // Vẽ Bar Chart
    if (document.getElementById('trainingTeamChart')) {
      Highcharts.chart('trainingTeamChart', {
        chart: {
          type: 'column',
          backgroundColor: 'transparent',
          style: { fontFamily: "'Ubuntu', sans-serif" },
        },
        title: { text: null },
        xAxis: { categories: sortedTeams, crosshair: true },
        yAxis: { min: 0, title: { text: 'Lượt tham gia' } },
        tooltip: {
          headerFormat: '<b>{point.x}</b><br/>',
          pointFormat: '{point.y} lượt tham gia',
        },
        plotOptions: {
          column: {
            borderRadius: 5,
            dataLabels: { enabled: true },
          },
        },
        series: [
          {
            name: 'Lượt học viên tham gia',
            data: dataSeries,
            color: '#0d6efd',
          },
        ],
        legend: { enabled: false },
        credits: { enabled: false },
      });
    }
  }

  // === HELPER: GROUPED COLUMN CHART ===
  function renderGroupedColumn(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container || !config.series.some((s) => s.data.some((v) => v > 0))) {
      if (container)
        container.innerHTML =
          '<p class="no-data-message">Không có dữ liệu.</p>';
      return;
    }
    Highcharts.chart(containerId, {
      chart: { type: 'column', backgroundColor: 'transparent' },
      title: {
        text: config.title,
        style: { fontSize: '18px', fontWeight: '500' },
      },
      xAxis: { categories: config.categories, title: { text: 'Team' } },
      yAxis: { title: { text: 'Value' }, allowDecimals: false },
      tooltip: { shared: true },
      plotOptions: {
        column: {
          borderRadius: 5,
          dataLabels: { enabled: true, format: '{y}' },
        },
      },
      series: config.series,
      credits: { enabled: false },
    });
  }

  // === HELPER: STACKED COLUMN CHART ===
  function renderStackedColumn(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container || !config.series.some((s) => s.data.some((v) => v > 0))) {
      if (container)
        container.innerHTML = '<p class="no-data-message">No data.</p>';
      return;
    }
    Highcharts.chart(containerId, {
      chart: { type: 'column', backgroundColor: 'transparent' },
      title: {
        text: config.title,
        style: { fontSize: '18px', fontWeight: '500' },
      },
      xAxis: { categories: config.categories, title: { text: 'Skills' } },
      yAxis: { title: { text: 'Giá trị' }, stackLabels: { enabled: true } },
      tooltip: {
        headerFormat: '<b>{point.x}</b><br/>',
        pointFormat: '{series.name}: {point.y}<br/>Total: {point.stackTotal}',
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          dataLabels: {
            enabled: true,
            formatter: function () {
              return this.y > 0 ? this.y : '';
            },
          },
        },
      },
      series: config.series,
      credits: { enabled: false },
    });
  }

  //TRACKING function getRostersforTracking

  // Hàm tải dữ liệu cho bảng schedule
  /**
   * (MỚI) Render bảng Lịch trực (Schedule) từ window.appState
   * Thay thế cho loadScheduleTable
   */
  async function renderScheduleTable(startDate, endDate) {
    const tbody = document.getElementById('schedule-table-body');
    tbody.innerHTML = ''; // Xóa 'Loading...'

    try {
      // (THAY ĐỔI) Đọc từ biến toàn cục
      const res = window.appState.trackingRosters;

      if ($.fn.DataTable.isDataTable('#schedule-table')) {
        $('#schedule-table').DataTable().clear().destroy();
      }

      if (!res || !res.success || !res.reports || res.reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">Không có lịch trình gần đây</td></tr>`;
        return;
      }

      // (MỚI) Lọc dữ liệu client-side dựa trên ngày
      const filterStart = startDate ? parseFilterDate(startDate) : null;
      const filterEnd = endDate ? parseFilterDate(endDate) : null;

      if (filterStart) filterStart.setHours(0, 0, 0, 0);
      if (filterEnd) filterEnd.setHours(23, 59, 59, 999);

      const filteredReports = res.reports.filter((report) => {
        if (!report.duty_day) return false;
        const parts = report.duty_day.split('/');
        if (parts.length !== 3) return false;
        const rowDate = new Date(+parts[2], parts[1] - 1, +parts[0]);

        if (filterStart && rowDate < filterStart) return false;
        if (filterEnd && rowDate > filterEnd) return false;
        return true;
      });

      if (filteredReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">Không tìm thấy dữ liệu cho những ngày đã chọn.</td></tr>`;
        return;
      }

      // Render dữ liệu đã lọc
      filteredReports.forEach((report) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${report.calendar || 'N/A'}</td>
          <td>${report.duty_day || 'N/A'}</td>
          <td>${report.team_assignment || 'N/A'}</td>
          <td>${report.rostered_members_emails || 'N/A'}</td>
          <td>${report.member_list || 'N/A'}</td>
          <td>${report.calendar_status || 'N/A'}</td>
      `;
        tbody.appendChild(row);
      });

      // Khởi tạo DataTable
      $('#schedule-table').DataTable({
        responsive: true,
        paging: true,
        searching: true,
        info: true,
        order: [[1, 'desc']], // Sắp xếp theo duty_day
        dom: '<"dataTables_top"Blf>rt<"dataTables_bottom"ip>',
        buttons: [
          'copy',
          'csv',
          'excel',
          'pdf',
          'print',
          { extend: 'colvis', text: 'Columns' },
        ],
      });
    } catch (error) {
      console.error('Error rendering schedule table:', error);
      showToast('Lỗi hiển thị lịch: ' + error.message, 'error');
      tbody.innerHTML = `<tr><td colspan="6">Error rendering data.</td></tr>`;
    }
  }

  // Hàm tải dữ liệu cho bảng incidents
  /**
   * (ĐÃ NÂNG CẤP AAR) Render bảng Sự cố (Incidents) từ window.appState
   * Sửa lại onclick để truyền cả đối tượng incident
   */
  async function renderIncidentsTable(startDate, endDate) {
    const tbody = document.getElementById('schedule-incidents-table-body');
    tbody.innerHTML = ''; // Xóa 'Loading...'

    try {
      const res = window.appState.trackingIncidents;

      if ($.fn.DataTable.isDataTable('#schedule-incidents-table')) {
        $('#schedule-incidents-table').DataTable().clear().destroy();
      }

      if (!res || res.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">Không có sự cố gần đây</td></tr>`;
        return;
      }

      // (Logic lọc ngày của bạn...)
      const isDateFiltering = startDate || endDate;
      const filterStartDate =
        isDateFiltering && startDate ? new Date(startDate) : null;
      const filterEndDate =
        isDateFiltering && endDate ? new Date(endDate) : null;
      if (filterStartDate) filterStartDate.setHours(0, 0, 0, 0);
      if (filterEndDate) filterEndDate.setHours(23, 59, 59, 999);

      const filteredReports = res.filter((incident) => {
        if (!isDateFiltering) return true;
        if (!incident.timestamp) return false;
        const datePart = incident.timestamp.split(' ')[0].split('/');
        const rowDate = new Date(+parts[2], parts[1] - 1, +parts[0]);
        if (filterStartDate && rowDate < filterStartDate) return false;
        if (filterEnd && rowDate > filterEnd) return false;
        return true;
      });

      if (filteredReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9">Không tìm thấy dữ liệu cho những ngày đã chọn.</td></tr>`;
        return;
      }

      filteredReports.forEach((incident) => {
        const row = document.createElement('tr');

        const status = escapeHtml(incident.status);

        // (THAY ĐỔI) Chuyển toàn bộ đối tượng thành chuỗi JSON
        const incidentJsonString = escapeHtml(JSON.stringify(incident));

        // (THAY ĐỔI) Cập nhật logic nút bấm
        const aarButton =
          status === 'closed'
            ? `<button class="btn btn-outline-success btn-sm" onclick='openAarModal(${incidentJsonString}, true)'>
             <i class='bx bx-show'></i> View
           </button>`
            : `<button class="btn btn-outline-primary btn-sm" onclick='openAarModal(${incidentJsonString}, false)'>
             <i class='bx bx-plus'></i> Add AAR
           </button>`;

        row.innerHTML = `
        <td>${incident.id}</td>
        <td>${incident.timestamp}</td>
        <td>${incident.admin}</td>
        <td>${incident.initial_selected_members}</td>
        <td>${incident.members}</td>
        <td>${incident.confirmations}</td>
        <td>${incident.location}</td>
        <td>${incident.event}</td>
        <td>${aarButton}</td> `;
        tbody.appendChild(row);
      });

      // (Khởi tạo DataTable, giữ nguyên)
      $('#schedule-incidents-table').DataTable({
        responsive: true,
        paging: true,
        searching: true,
        info: true,
        order: [[1, 'desc']],
        columns: [
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          { orderable: false, width: '5%' },
        ],
        dom: '<"dataTables_top"Blf>rt<"dataTables_bottom"ip>',
        buttons: [
          'copy',
          'csv',
          'excel',
          'pdf',
          'print',
          { extend: 'colvis', text: 'Columns' },
        ],
      });
    } catch (error) {
      console.error('Error loading incidents table:', error);
      showToast('Lỗi khi tải sự cố: ' + error.message, 'error');
      tbody.innerHTML = `<tr><td colspan="9">Lỗi hiển thị dữ liệu.</td></tr>`;
    }
  }

  window.renderTrackingPage = async function (forceFetch = false) {
    const container = document.getElementById('event-grid-container');
    if (!container) return;

    // 1. Tải dữ liệu (Giữ nguyên logic fetch)
    if (
      forceFetch ||
      !window.appState.trackingIncidents ||
      window.appState.trackingIncidents.length === 0
    ) {
      container.innerHTML =
        '<div class="text-center p-4"><span class="spinner-border text-primary"></span><p>Đang tải sự kiện...</p></div>';

      const { data, error } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Lỗi Supabase:', error);
        container.innerHTML = `<p class="text-center text-danger">Lỗi tải dữ liệu: ${error.message}</p>`;
        return;
      }
      window.appState.trackingIncidents = data || [];
    }

    let incidents = window.appState.trackingIncidents;

    // 2. Logic Phân quyền
    const isAdmin = (window.userSession?.role || '').toLowerCase() === 'admin';
    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();

    if (!isAdmin) {
      incidents = incidents.filter((inc) => {
        const allParticipants = (
          inc.initial_selected_members || ''
        ).toLowerCase();
        return allParticipants.includes(myEmail);
      });
    }

    // 3. Logic tìm kiếm & ngày tháng (Giữ nguyên)
    const searchKey = (
      document.getElementById('tracking-search-input')?.value || ''
    ).toLowerCase();
    const startDateVal = $('#filter-date-start-tracking').val();
    const endDateVal = $('#filter-date-end-tracking').val();
    let startTs = startDateVal
      ? new Date(startDateVal + 'T00:00:00').getTime()
      : 0;
    let endTs = endDateVal
      ? new Date(endDateVal + 'T23:59:59').getTime()
      : Infinity;

    container.innerHTML = '';
    let hasResult = false;

    // 4. RENDER GIAO DIỆN ĐẸP
    incidents.forEach((inc) => {
      // Mapping cột cho đúng DB của bạn
      const eventName = String(inc.event_name || 'Không có tên');
      const location = String(inc.location_text || 'N/A');
      const id = String(inc.id || '');
      const timestamp = inc.created_at
        ? new Date(inc.created_at).toLocaleString('vi-VN')
        : 'N/A';
      const confirmations = inc.confirmations || 0;

      // Bộ lọc search
      if (
        searchKey &&
        !eventName.toLowerCase().includes(searchKey) &&
        !location.toLowerCase().includes(searchKey)
      )
        return;

      // Bộ lọc ngày
      if (startDateVal || endDateVal) {
        const incTs = new Date(inc.created_at).getTime();
        if (incTs < startTs || incTs > endTs) return;
      }

      hasResult = true;
      const isClosed = inc.status === 'closed';
      const cardClass = isClosed
        ? 'event-card ev-closed'
        : 'event-card ev-active';
      const badgeClass = isClosed
        ? 'ev-status st-closed'
        : 'ev-status st-active';
      const statusText = isClosed ? '✔ Đã kết thúc' : '🔴 Đang xử lý';

      const incString = encodeURIComponent(JSON.stringify(inc));
      const adminName =
        typeof window.getUserName === 'function'
          ? window.getUserName(inc.admin_activate)
          : 'admin';

      // HTML ĐẸP NHƯ CŨ
      container.insertAdjacentHTML(
        'beforeend',
        `
            <div class="${cardClass}" onclick="openDossierView('${incString}')" style="cursor:pointer;">
                <span class="${badgeClass}">${statusText}</span>
                <h5 style="margin: 0 0 10px 0; font-weight: bold; color: #333; padding-right: 90px;">${escapeHtml(
                  eventName
                )}</h5>
                
                <div style="font-size: 13px; color: #666;">
                    <i class='bx bx-map'></i> ${escapeHtml(location)}<br>
                    <i class='bx bx-time'></i> ${timestamp}
                </div>
                
                <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: end; border-top: 1px solid #eee; padding-top: 10px;">
                     <div style="font-size: 12px; color: #888;">
                        <span style="font-family: monospace;">#${id.substring(
                          0,
                          8
                        )}</span><br>
                        <i class='bx bxs-user-badge'></i> <b>${escapeHtml(
                          adminName
                        )}</b>
                     </div>
                     <small><strong>${confirmations}</strong> phản hồi</small>
                </div>
            </div>
        `
      );
    });

    if (!hasResult) {
      container.innerHTML =
        '<p class="text-center text-muted" style="grid-column: 1/-1; padding: 20px;">Không tìm thấy kết quả phù hợp.</p>';
    }
  };

  // --- CÁC HÀM HỖ TRỢ GIAO DIỆN MỚI ---
  // ============================================================
  // 1. Mở giao diện chi tiết (Dossier) - PHIÊN BẢN HOÀN CHỈNH NHẤT
  // ============================================================
  window.openDossierView = function (incString) {
    let incParams;
    try {
      incParams = JSON.parse(decodeURIComponent(incString));
    } catch (e) {
      console.error('Lỗi parse dữ liệu sự kiện:', e);
      return;
    }
    // --- LẤY DỮ LIỆU TƯƠI NHẤT ---
    let inc = incParams;
    if (window.appState && window.appState.trackingIncidents) {
      const freshInc = window.appState.trackingIncidents.find(
        (i) => String(i.id) === String(incParams.id)
      );
      if (freshInc) inc = freshInc;
    }

    // 🔥 GÁN ID CHO BIẾN TOÀN CỤC
    window.selectedIncidentId = inc.id;
    window.currentDossierId = inc.id;

    // --- CHUYỂN VIEW ---
    const listView = document.getElementById('tracking-view-list');
    const dossierView = document.getElementById('tracking-view-dossier');
    if (listView) listView.style.display = 'none';
    if (dossierView) {
      dossierView.style.display = 'block';
      dossierView.classList.add('active');
    }

    // Helper lấy tên
    const getName = (email) => {
      if (!email) return 'Unknown';
      if (typeof window.getUserName === 'function')
        return window.getUserName(email);
      return email;
    };

    // --- ĐIỀN HEADER (Dùng đúng tên cột DB: event_name, location_text) ---
    if (document.getElementById('dossier-title'))
      document.getElementById('dossier-title').textContent =
        inc.event_name || 'Chưa có tiêu đề';
    if (document.getElementById('dossier-id'))
      document.getElementById('dossier-id').textContent = '#' + (inc.id || '');
    if (document.getElementById('dossier-time'))
      document.getElementById('dossier-time').textContent =
        inc.created_at || '';
    if (document.getElementById('dossier-location'))
      document.getElementById('dossier-location').textContent =
        inc.location_text || '';

    // --- TRẠNG THÁI ---
    const isClosed = inc.status === 'closed';
    const isActivated = !!inc.admin_activate; // Flag kích hoạt
    const badge = document.getElementById('dossier-status-badge');
    if (badge) {
      badge.className = isClosed
        ? 'ev-status st-closed'
        : 'ev-status st-active';
      badge.textContent = isClosed
        ? '✔ ĐÃ KẾT THÚC'
        : isActivated
        ? '🔴 ĐANG HOẠT ĐỘNG'
        : '⚠️ CHỜ KÍCH HOẠT';
    }

    const isAdmin = window.userSession.role.toLowerCase() === 'admin';

    // --- XỬ LÝ CÁC TAB HIỂN THỊ ---
    // Reset về Tab đầu tiên (Nhật ký) mỗi khi mở lại Modal để tránh bị lưu cache view cũ
    const logTabBtn = document.getElementById('tab-log-tab');
    if (logTabBtn && typeof bootstrap !== 'undefined') {
      const tabTrigger = new bootstrap.Tab(logTabBtn);
      tabTrigger.show();
    }

    // --- XỬ LÝ ẨN/HIỆN CÁC NÚT CHỨC NĂNG TRÊN HEADER ---

    // 1. Nút Lập Báo Cáo (Màu vàng)
    const btnReport = document.getElementById('btn-open-report-modal');
    if (btnReport) {
      btnReport.onclick = function () {
        window.openReportModal();
      };

      btnReport.title = 'Lập báo cáo';

      if (isClosed) {
        if (isAdmin) {
          btnReport.style.display = 'inline-block';
          btnReport.title = 'Xuất lại Báo cáo Hoàn thành (từ dữ liệu AAR)';
          const aarData = {
            summary: inc.aar_summary,
            issues: inc.aar_issues,
            lessons: inc.aar_lessons_learned,
          };
          btnReport.onclick = function () {
            window.openReportModal('COMPLETION', aarData);
          };
        } else {
          btnReport.style.display = 'none';
        }
      } else {
        btnReport.style.display = 'inline-block';
      }
    }

    // 2. 🔥 NÚT MỚI: PHƯƠNG ÁN 🔥
    const btnPlan = document.getElementById('btn-open-plan-modal');
    if (btnPlan) {
      btnPlan.style.display = 'inline-block';
      btnPlan.onclick = function () {
        // Đóng Modal Dossier hiện tại (nếu muốn mở Modal mới đè lên)
        // Hoặc giữ nguyên nếu muốn chồng Modal (Bootstrap hỗ trợ chồng Modal nhưng cần cẩn thận z-index)

        // Cách 1: Ẩn Modal Dossier đi rồi mở Modal Plan (Gọn gàng)
        /*
            const dossierModalEl = document.getElementById('tracking-view-dossier'); 
            // Lưu ý: tracking-view-dossier của bạn đang là 1 DIV giả lập Modal hay là Bootstrap Modal thật?
            // Dựa vào code trước thì nó là DIV class="app-view". 
            // Nên ta chỉ cần gọi hàm mở Modal mới đè lên là được.
            */

        // GỌI HÀM MỞ MODAL BẠN VỪA VIẾT
        if (typeof window.openIAPModal === 'function') {
          window.openIAPModal(inc.id, inc.event);
        } else {
          console.error('Chưa load được hàm openIAPModal');
        }
      };
    }

    // 3. Nút AAR (Màu xanh)
    const btnAar = document.getElementById('btn-open-aar-modal');
    if (btnAar) {
      btnAar.style.display = isAdmin ? 'inline-block' : 'none';

      if (isClosed) {
        btnAar.innerHTML = "<i class='bx bx-check-double'></i> Xem kết quả AAR";
        btnAar.onclick = function () {
          if (typeof openAarModal === 'function') openAarModal(inc, true);
        };
      } else {
        btnAar.innerHTML = "<i class='bx bx-notepad'></i> Đánh giá (AAR)";
        btnAar.onclick = function () {
          if (typeof openAarModal === 'function') openAarModal(inc, false);
        };
      }
    }

    // 4. Nút Điều phối (Chỉ Admin)
    const rotationControls = document.getElementById('admin-rotation-controls');
    if (rotationControls) {
      rotationControls.style.display = isAdmin && !isClosed ? 'flex' : 'none';
    }

    // --- ĐIỀN DANH SÁCH NHÂN SỰ ---
    if (typeof updateDossierMemberList === 'function') {
      updateDossierMemberList(inc);
    } else {
      // Fallback logic cũ
      const memberListEl = document.getElementById('dossier-member-list');
      if (memberListEl) {
        memberListEl.innerHTML = '';
        const invitedStr = inc.initial_selected_members || '';
        const confirmedStr = (inc.members || '').toLowerCase();
        const invitedEmails = invitedStr
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s);

        invitedEmails.forEach((email) => {
          const displayName = getName(email);
          let isConfirmed = false;
          if (confirmedStr.includes(email.toLowerCase())) isConfirmed = true;
          else if (confirmedStr.includes(String(displayName).toLowerCase()))
            isConfirmed = true;

          if (window.appState && Array.isArray(window.appState.teamData)) {
            const mInfo = window.appState.teamData.find(
              (m) => m.email && m.email.toLowerCase() === email.toLowerCase()
            );
            if (
              mInfo &&
              mInfo.username &&
              confirmedStr.includes(mInfo.username.toLowerCase())
            )
              isConfirmed = true;
          }

          const icon = isConfirmed
            ? '<span class="badge bg-success">✔ Đã xác nhận</span>'
            : '<span class="badge bg-secondary">⏳ Chờ</span>';

          memberListEl.insertAdjacentHTML(
            'beforeend',
            `
                    <div class="member-row">
                        <div>
                            <div style="font-weight:bold; color:#333;">${window.escapeHtml(
                              displayName
                            )}</div>
                            <div style="font-size:11px; color:#999;">${window.escapeHtml(
                              email
                            )}</div>
                        </div>
                        ${icon}
                    </div>
                `
          );
        });
        if (document.getElementById('dossier-stat-confirmed'))
          document.getElementById('dossier-stat-confirmed').textContent =
            inc.confirmations || 0;
        if (document.getElementById('dossier-stat-declined'))
          document.getElementById('dossier-stat-declined').textContent =
            invitedEmails.length - (inc.confirmations || 0);
      }
    }

    // --- ĐIỀN CHAT LOG ---
    const adminName = getName(inc.admin);
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.innerHTML = `
            <div class="msg system">
                <div class="msg-bubble">
                <strong>KÍCH HOẠT SỰ KIỆN: ${window.escapeHtml(
                  inc.id
                )}</strong><br>
                Thời gian: ${inc.timestamp}<br>
                Người kích hoạt: ${window.escapeHtml(adminName)}
                </div>
            </div>
        `;
      if (typeof window.loadEventLogs === 'function') {
        window.loadEventLogs(inc.id);
      }
    }

    // --- TAB PREVIEW AAR ---
    // --- TAB PREVIEW AAR ---
    if (inc.aar_summary || isClosed) {
      if (document.getElementById('aar-content-placeholder'))
        document.getElementById('aar-content-placeholder').style.display =
          'none';
      if (document.getElementById('aar-content-real'))
        document.getElementById('aar-content-real').style.display = 'block';

      // Điền nội dung (Giữ nguyên)
      // --- SỬ DỤNG HÀM FORMAT ĐỂ HIỂN THỊ ĐẸP HƠN ---
      if (document.getElementById('view-aar-summary')) {
        document.getElementById('view-aar-summary').innerHTML =
          formatAarDisplay(inc.aar_summary);
      }

      // Đối với Vấn đề & Bài học, nếu muốn đẹp thì cũng dùng hàm, còn không thì giữ nguyên textContent hoặc chỉ replace xuống dòng
      if (document.getElementById('view-aar-issues')) {
        // Thay thế xuống dòng \n thành <br> để dễ đọc hơn
        const raw = inc.aar_issues || '';
        document.getElementById('view-aar-issues').innerHTML = raw
          ? raw.replace(/\n/g, '<br>')
          : '<span class="text-muted fst-italic">(Chưa cập nhật)</span>';
      }

      if (document.getElementById('view-aar-lessons')) {
        const raw = inc.aar_lessons_learned || '';
        document.getElementById('view-aar-lessons').innerHTML = raw
          ? raw.replace(/\n/g, '<br>')
          : '<span class="text-muted fst-italic">(Chưa cập nhật)</span>';
      }
      if (document.getElementById('view-aar-admin'))
        document.getElementById('view-aar-admin').textContent =
          getName(inc.aar_admin) || 'admin';

      // 🔥 THÊM LOGIC MỚI: ĐIỀU KHIỂN BADGE TRẠNG THÁI 🔥
      // Logic này đi kèm với việc bạn đã sửa HTML thêm 2 cái div id="aar-badge-closed" và id="aar-badge-active"
      if (isClosed) {
        // Trường hợp 1: Đã đóng thật sự (Status = Closed)
        if ($('#aar-badge-closed').length) $('#aar-badge-closed').show();
        if ($('#aar-badge-active').length) $('#aar-badge-active').hide();
      } else {
        // Trường hợp 2: Có AAR nhưng vẫn đang mở (Status = Active)
        if ($('#aar-badge-closed').length) $('#aar-badge-closed').hide();
        if ($('#aar-badge-active').length) $('#aar-badge-active').show();
      }
    } else {
      if (document.getElementById('aar-content-placeholder'))
        document.getElementById('aar-content-placeholder').style.display =
          'block';
      if (document.getElementById('aar-content-real'))
        document.getElementById('aar-content-real').style.display = 'none';
    }

    // --- ACTION BAR (XỬ LÝ 3 TRẠNG THÁI) ---
    const actionBar = document.getElementById('dossier-action-bar');
    if (actionBar) {
      const myEmail = String(window.userSession.email || '')
        .toLowerCase()
        .trim();
      const myUser = String(window.userSession.username || '')
        .toLowerCase()
        .trim();
      const invitedStr = (inc.initial_selected_members || '').toLowerCase();
      const confirmedStr = (inc.members || '').toLowerCase();
      const declinedStr = (inc.declined_members || '').toLowerCase();
      const isActive = inc.status !== 'closed';

      // 1. LOGIC KÍCH HOẠT (CHỈ DÀNH CHO ADMIN)
      if (isAdmin && isActive && !isActivated) {
        actionBar.style.display = 'flex';
        actionBar.className = 'alert alert-danger shadow-sm mb-3';
        actionBar.innerHTML = `
                <div class="d-flex justify-content-between align-items-center w-100">
                    <div>
                        <h5 style="margin:0; color:#721c24;">
                            <i class='bx bxs-bolt-circle'></i> CHƯA KÍCH HOẠT
                        </h5>
                        <small>Sự kiện này đang chờ Admin kích hoạt khẩn cấp.</small>
                    </div>
                    <button class="btn btn-danger fw-bold" onclick="activateIncident('${inc.id}')">
                        <i class='bx bxs-bolt-circle'></i> KÍCH HOẠT KHẨN CẤP
                    </button>
                </div>
            `;
      }
// ============================================================
      // 2. LOGIC PHẢN HỒI (DÀNH CHO NGƯỜI DÙNG)
      // ============================================================
      else if (isActive && isActivated) {
        // Lấy thông tin user hiện tại (đảm bảo không bị lỗi null/undefined)
        const myEmail = String(window.userSession?.email || '').toLowerCase().trim();
        const myUser = String(window.userSession?.username || '').toLowerCase().trim();
        const myFullName = String(window.userSession?.full_name || '').toLowerCase().trim();

        // 🛡️ HÀM BẢO VỆ: Tuyệt đối không so sánh nếu từ khóa bị rỗng
        const checkIncludes = (listStr, keyword) => {
          if (!keyword) return false;
          return listStr.includes(keyword);
        };

        // Kiểm tra 3 danh sách (Sử dụng hàm bảo vệ)
        const isInvited =
          checkIncludes(invitedStr, myEmail) || 
          checkIncludes(invitedStr, myUser) || 
          checkIncludes(invitedStr, myFullName);

        const isConfirmed =
          checkIncludes(confirmedStr, myEmail) || 
          checkIncludes(confirmedStr, myUser) || 
          checkIncludes(confirmedStr, myFullName);

        const isDeclined =
          checkIncludes(declinedStr, myEmail) || 
          checkIncludes(declinedStr, myUser) || 
          checkIncludes(declinedStr, myFullName);

        // 🔥 THỨ TỰ ƯU TIÊN HIỂN THỊ GIAO DIỆN 🔥
        if (isConfirmed) {
          // Ưu tiên 1: Đã xác nhận -> Tắt thông báo
          actionBar.style.display = 'none';
        } 
        else if (isDeclined) {
          // Ưu tiên 2: Đã từ chối -> Hiện bảng xám
          actionBar.style.display = 'flex';
          actionBar.className = 'alert alert-secondary shadow-sm mb-3 justify-content-between align-items-center';
          actionBar.innerHTML = `
          <div>
            <h5 style="margin:0; color:#666; font-size:16px;">
              <i class='bx bx-x-circle'></i> BẠN ĐÃ TỪ CHỐI
            </h5>
            <p style="margin:0; font-size:13px; color:#666;">
              Hệ thống đã ghi nhận phản hồi của bạn.
            </p>
          </div>
          <div>
             <button class="btn btn-outline-primary btn-sm" onclick="submitIncidentResponse('confirm')">Tham gia lại</button>
          </div>
          `;
        } 
        else if (isInvited) {
          // Ưu tiên 3: Được mời nhưng chưa phản hồi gì -> Hiện bảng vàng
          actionBar.style.display = 'flex';
          actionBar.className = 'alert alert-warning shadow-sm mb-3 justify-content-between align-items-center';
          actionBar.innerHTML = `
          <div>
            <h5 style="margin:0; color:#856404; font-size:16px;">
              <i class='bx bxs-megaphone'></i> YÊU CẦU TỪ HỆ THỐNG
            </h5>
            <p style="margin:0; font-size:13px; color:#856404;">
              Bạn được điều động tham gia sự kiện này. Vui lòng phản hồi ngay!
            </p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-success btn-sm fw-bold" onclick="submitIncidentResponse('confirm')">
              <i class='bx bx-check'></i> XÁC NHẬN
            </button>
            <button class="btn btn-danger btn-sm fw-bold" onclick="submitIncidentResponse('decline')">
              <i class='bx bx-x'></i> TỪ CHỐI
            </button>
          </div>
          `;
        } 
        else {
          // Không thuộc đối tượng nào -> Ẩn
          actionBar.style.display = 'none';
        }
      } else {
        // Sự kiện đã kết thúc hoặc chưa kích hoạt -> Ẩn
        actionBar.style.display = 'none';
      }
    }
  };

  /**
   * ============================================================
   * HÀM FORMAT HIỂN THỊ AAR (Dùng cho Dossier View)
   * ============================================================
   */
  function formatAarDisplay(data) {
    // Kiểm tra dữ liệu đầu vào
    if (!data) return '';

    // Kiểm tra xem có nội dung AAR nào không
    const hasSummary = data.aar_summary && data.aar_summary.trim() !== '';
    const hasIssues = data.aar_issues && data.aar_issues.trim() !== '';
    const hasLessons =
      data.aar_lessons_learned && data.aar_lessons_learned.trim() !== '';

    if (!hasSummary && !hasIssues && !hasLessons) {
      return `<div class="text-muted text-center py-4" style="background: #f8f9fa; border-radius: 8px; border: 1px dashed #dee2e6;">
                    <i class='bx bx-history fs-3 mb-2 text-secondary'></i><br>
                    <em>Chưa có Báo cáo sau hành động (AAR).</em>
                </div>`;
    }

    let html = `<div class="d-flex flex-column gap-3">`;

    // 1. Tóm tắt kết quả (Màu xanh lá)
    if (hasSummary) {
      html += `
            <div class="card border-success border-opacity-25 shadow-sm">
                <div class="card-header bg-success bg-opacity-10 text-success fw-bold py-2">
                    <i class='bx bx-check-circle me-1'></i> Tóm tắt kết quả
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_summary.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    // 2. Vấn đề / Khó khăn (Màu đỏ)
    if (hasIssues) {
      html += `
            <div class="card border-danger border-opacity-25 shadow-sm">
                <div class="card-header bg-danger bg-opacity-10 text-danger fw-bold py-2">
                    <i class='bx bx-error me-1'></i> Vấn đề / Khó khăn
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_issues.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    // 3. Bài học kinh nghiệm (Màu xanh dương/Vàng)
    if (hasLessons) {
      html += `
            <div class="card border-primary border-opacity-25 shadow-sm">
                <div class="card-header bg-primary bg-opacity-10 text-primary fw-bold py-2">
                    <i class='bx bx-bulb me-1'></i> Bài học kinh nghiệm
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_lessons_learned.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    html += `</div>`;
    return html;
  }
  // 3. Chuyển Tab trong Dossier
  window.switchDossierTab = function (tabId, btn) {
    // Ẩn tất cả tab content
    document
      .querySelectorAll('#tracking-view-dossier .tab-pane')
      .forEach((el) => el.classList.remove('active'));
    // Bỏ active tất cả nút
    document
      .querySelectorAll('#tracking-view-dossier .tab-btn')
      .forEach((el) => el.classList.remove('active'));

    // Hiện tab được chọn
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
  };

  // 4. Gắn sự kiện tìm kiếm (Live Search)
  document
    .getElementById('tracking-search-input')
    .addEventListener('keyup', function () {
      renderTrackingPage(); // Vẽ lại lưới khi gõ phím
    });

  // Event listener cho nút Filter
  $('#btn-filter-tracking')
    .off('click')
    .on('click', function () {
      const start = $('#filter-date-start-tracking').val();
      const end = $('#filter-date-end-tracking').val();
      if (start && end) {
        window.renderTrackingPage();
      } else {
        showToast('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc.', 'warning');
      }
    });

  $('#btn-clear-filter-tracking')
    .off('click')
    .on('click', function () {
      $('#filter-date-start-tracking').val('');
      $('#filter-date-end-tracking').val('');
      $('#tracking-search-input').val('');
      window.renderTrackingPage();
    });
  // ============================================================
  // CÁC HÀM HỖ TRỢ GIAO DIỆN (MODAL & TABS) CHO TRANG TRACKING
  // (Dán vào cuối file script-js-RRT.txt)
  // ============================================================

  // 1. Mở Modal bất kỳ theo ID
  window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex'; // Dùng flex để căn giữa
    } else {
      console.warn('Không tìm thấy modal có ID: ' + modalId);
    }
  };

  // 3. Chuyển Tab trong giao diện Dossier (Nhật ký / AAR)
  // ==========================================
  // 1. HÀM CHUYỂN TAB ĐÃ CẬP NHẬT ĐÚNG ID
  // ==========================================
  window.switchDossierTab = function (tabId, btnElement) {
    const dossierView = document.getElementById('tracking-view-dossier');
    if (!dossierView) return;

    // Ẩn tất cả các tab-pane
    const panes = dossierView.querySelectorAll('.tab-pane');
    panes.forEach((el) => el.classList.remove('active'));

    // Bỏ active các nút tab
    const btns = dossierView.querySelectorAll('.tab-btn');
    btns.forEach((el) => el.classList.remove('active'));

    // Hiện tab được chọn
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    // Active nút được nhấn
    if (btnElement) btnElement.classList.add('active');

    // GỌI HÀM TẢI DỮ LIỆU KHI CHUYỂN SANG TAB AAR
    if (tabId === 'tab-aar-preview') {
      const incidentId = window.currentDossierId || window.selectedIncidentId;
      if (incidentId && typeof window.loadAARPreview === 'function') {
        window.loadAARPreview(incidentId);
      }
    }
  };
  // 2. HÀM ĐÓNG DOSSIER VIEW (Giữ nguyên bản chuẩn của bạn)
  window.closeDossierView = function () {
    const listView = document.getElementById('tracking-view-list');
    const dossierView = document.getElementById('tracking-view-dossier');

    try {
      if (dossierView) {
        dossierView.style.display = 'none';
        dossierView.classList.remove('active');
      }
    } catch (e) {
      console.warn('Lỗi khi ẩn Dossier:', e);
    }

    try {
      if (listView) {
        listView.style.display = 'block';
      }
    } catch (e) {
      console.warn('Lỗi khi hiện List:', e);
    }

    // Reset biến trạng thái
    window.currentDossierId = null;
    window.selectedIncidentId = null;
  };

  // 6. Đóng modal khi click ra ngoài (Optional)
  window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };

  //NOTIFICATION function getNotificationsForMess
  window.renderMessageTable = async function () {
    const tbody = document.getElementById('message-table-body');
    if (!tbody) return;

    // 1. Kiểm tra session
    if (!window.userSession || !window.userSession.email) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi: Không tìm thấy thông tin phiên đăng nhập.</td></tr>`;
      return;
    }

    // 2. Fetch dữ liệu trực tiếp từ Supabase
    try {
      const { data: notifications, error } = await window.supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_email', window.userSession.email) // Chỉ lấy thông báo của user này
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Xóa nội dung cũ
      tbody.innerHTML = '';

      if (!notifications || notifications.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Không có thông báo nào.</td></tr>`;
        return;
      }

      // 3. Render danh sách
      notifications.forEach((item) => {
        const isRead = item.is_read === true;
        const row = document.createElement('tr');
        if (!isRead) row.classList.add('table-warning');

        // Format thời gian
        const displayTime = new Date(item.created_at).toLocaleString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        row.innerHTML = `
                <td style="white-space: nowrap;">${displayTime}</td>
                <td>${item.message}</td>
                
                <td class="text-center">
                    ${
                      isRead
                        ? `<span class="badge bg-success"><i class='bx bxs-check-circle'></i> Đã đọc</span>`
                        : `<button class="btn btn-sm btn-outline-primary" onclick="markAsRead('${item.id}', this)">
                             <i class='bx bxs-envelope'></i> Đánh dấu đã đọc
                           </button>`
                    }
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error('Lỗi khi tải thông báo:', err);
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
    }
  };

  // Hàm xử lý "Đánh dấu đã đọc" đi kèm
  window.markAsRead = async function (notificationId, btnElement) {
    showLoadingSpinner(true);
    const { error } = await window.supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    hideLoadingSpinner();

    if (error) {
      showToast('Lỗi cập nhật: ' + error.message, 'error');
    } else {
      showToast('Đã đánh dấu là đã đọc', 'success');
      // Reload lại bảng sau khi update
      window.renderMessageTable();
    }
  };

  /**
   * @param {string} recordId - ID (UUID) của record trong bảng 'notifications'
   * @param {HTMLElement} btn - Nút bấm để cập nhật giao diện
   */
  window.markNotificationAsRead = async function (notificationId, btnElement) {
    if (!notificationId) return;

    // 1. Hiển thị trạng thái đang xử lý trên nút bấm
    const originalContent = btnElement.innerHTML;
    btnElement.innerHTML =
      '<span class="spinner-border spinner-border-sm"></span>';
    btnElement.disabled = true;

    try {
      // 2. Cập nhật Database
      const { error } = await window.supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      showToast('Đã đánh dấu là đã đọc', 'success');

      // 3. ĐỒNG BỘ GIAO DIỆN (CỐT LÕI CỦA VẤN ĐỀ)
      // Gọi lại tất cả các hàm render để chúng tự lấy dữ liệu mới nhất

      // Cập nhật bảng thông báo chính
      if (typeof window.renderMessageTable === 'function') {
        await window.renderMessageTable();
      }

      // Cập nhật menu thông báo (dropdown chuông)
      if (typeof window.loadUserNotifications === 'function') {
        await window.loadUserNotifications();
      }
    } catch (err) {
      console.error('Lỗi khi đánh dấu đã đọc:', err);
      showToast('Lỗi cập nhật: ' + err.message, 'error');
      // Hoàn tác trạng thái nút
      btnElement.innerHTML = originalContent;
      btnElement.disabled = false;
    }
  };
  // --- Cập nhật badge chuông mượt mà ---
  function updateNotificationIconCount(change) {
    const el = document.querySelector('.notification .num');
    let count = parseInt(el.textContent) || 0;
    el.textContent = Math.max(0, count + change);
    el.classList.add('badge-changed');
    setTimeout(() => el.classList.remove('badge-changed'), 600);
  }
// PATCH 13: loadUserNotifications – chỉ hiện thông báo CHƯA đọc
window.loadUserNotifications = async function () {
  if (!window.userSession?.email) return;

  const list = document.getElementById('notification-list');
  const numEl = document.querySelector('.notification .num');

  try {
    const { data: notifications, error } = await window.supabaseClient
      .from('notifications')
      .select('*')
      .eq('user_email', window.userSession.email)
      .eq('is_read', false)          // ← THÊM DÒNG NÀY
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (numEl) numEl.textContent = notifications?.length || 0;
    if (!list) return;
    list.innerHTML = '';

    if (!notifications || notifications.length === 0) {
      list.innerHTML =
        '<li class="p-3 text-muted text-center">Không có thông báo mới.</li>';
      return;
    }

    notifications.forEach((n) => {
      const dateStr = n.created_at
        ? new Date(n.created_at).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : '';

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="p-2 border-bottom">
          <div style="font-size:.9em;font-weight:bold;">
            ${window.escapeHtml?.(n.message) || n.message}
          </div>
          <div style="font-size:.7em;color:gray;" class="mb-1">${dateStr}</div>
          <button class="btn btn-sm btn-outline-danger"
                  onclick="window.markNotificationAsRead('${n.id}',this)">
            <i class='bx bxs-envelope'></i> Đánh dấu đã đọc
          </button>
        </div>`;
      list.appendChild(li);
    });

    // Hiện dropdown
    const menu = document.getElementById('notificationMenu');
    if (menu) menu.style.display = 'block';

  } catch (err) {
    console.error('[loadUserNotifications] Lỗi:', err);
  }
};
  // Sự kiện mở/đóng menu chuông notification
  document
    .getElementById('notificationIcon')
    .addEventListener('click', function (e) {
      e.preventDefault();
      const menu = document.getElementById('notificationMenu');
      loadUserNotifications();
      menu.style.display = 'block';
      e.stopPropagation();
    });
  // Close menu khi click ra ngoài
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('notificationMenu');
    const icon = document.getElementById('notificationIcon');
    if (!menu.contains(e.target) && !icon.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
  // Không đóng menu khi click trong menu
  document
    .getElementById('notificationMenu')
    .addEventListener('click', function (e) {
      e.stopPropagation();
    });

  // ========================================================================
  // XỬ LÝ SỰ KIỆN KHI ĐỔI TRẠNG THÁI TRÊN BẢNG DATA (APPROVAL STATUS)
  // ========================================================================
  $(document).on('change', '.update-status', async function () {
    const rrtRecordId = $(this).data('report-id');
    const newStatus = $(this).val();

    // 1. NẾU CHỌN "YÊU CẦU SỬA" -> BẬT MODAL NHẬP LÝ DO
    if (newStatus === 'edit') {
      // Lưu lại ID hồ sơ để dùng khi submit
      window.tempEditProfileId = rrtRecordId;

      // Xóa trắng ô nhập liệu cũ và bật Modal lên
      $('#edit-requirements-text').val('');
      const editModal = new bootstrap.Modal(
        document.getElementById('modal-edit-requirements')
      );
      editModal.show();
      return; // Dừng lại ở đây, chờ Admin nhập xong rồi tính tiếp
    }

    // 2. NẾU CHỌN TRẠNG THÁI KHÁC (Chờ duyệt / Đã duyệt) -> CẬP NHẬT TRỰC TIẾP
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // Gọi Supabase để cập nhật trạng thái
      const { error } = await supabaseClient
        .from('profiles')
        .update({ approval_status: newStatus })
        .eq('id', rrtRecordId);

      if (error) throw error;

      showToast('Cập nhật trạng thái thành công!', 'success');

      // LÀM MỚI UI

      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái:', err);
      showToast('Lỗi cập nhật: ' + err.message, 'error');

      // Trả lại trạng thái cũ trên giao diện nếu lỗi
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } finally {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
    }
  });

  // Hủy hành động (Khi Admin tắt Modal mà không nhập)
  // Tính năng này tự động trả dropdown về trạng thái trước đó
  document
    .getElementById('modal-edit-requirements')
    ?.addEventListener('hidden.bs.modal', function () {
      // Nếu Admin bấm Hủy, làm tươi lại bảng để select box tự nhảy về giá trị đúng trong CSDL
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
    });
  $(document).on('click', '.delete-report', function () {
    const rrtRecordId = $(this).data('report-id');

    // Hộp thoại xác nhận
    showToastConfirm(
      `Bạn có chắc chắn muốn xóa Biểu mẫu RRT <strong>${rrtRecordId}</strong>?`,
      async function () {
        // 1. Hiệu ứng loading
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

        try {
          // 2. Gọi Supabase để xóa
          // Lưu ý: Thay 'reports' bằng tên bảng chính xác của bạn trong Supabase
          // Thay 'id' bằng cột khóa chính bạn đang dùng (nếu nó là 'rrt_id' chẳng hạn)
          const { error } = await supabaseClient
            .from('profiles')
            .delete()
            .eq('id', rrtRecordId);

          if (error) throw error;

          // 3. THÀNH CÔNG: Hiển thị toast
          showToast('Đã xóa báo cáo thành công!', 'success');

          // 4. LÀM MỚI UI
          // Không cần gọi lại getInitialData phức tạp.
          // Chỉ cần vẽ lại bảng là xong, dữ liệu sẽ tự cập nhật từ Supabase
          if (typeof window.renderRRTTable === 'function') {
            window.renderRRTTable();
          }

          // (Tùy chọn) Nếu bạn muốn chắc chắn toàn bộ Dashboard được sync:
          // if (typeof window.enterDashboard === 'function') await window.enterDashboard();
        } catch (err) {
          console.error('Lỗi xóa báo cáo:', err);
          showToast('Lỗi xóa báo cáo: ' + err.message, 'error');
        } finally {
          // 5. Tắt loading
          if (typeof showLoadingSpinner === 'function')
            showLoadingSpinner(false);
        }
      }
    );
  });
  // ========================================================================
  // SUBMIT YÊU CẦU CHỈNH SỬA (Admin nhập lý do rồi gửi)
  // ========================================================================
  window.submitEditRequirements = async function () {
    const requirements = $('#edit-requirements-text').val();
    const profileId = window.tempEditProfileId;

    // Validate
    if (!profileId) {
      showToast('Lỗi: Không tìm thấy ID hồ sơ!', 'error');
      return;
    }

    if (!requirements || requirements.trim() === '') {
      showToast('Vui lòng nhập yêu cầu chỉnh sửa!', 'warning');
      return;
    }

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      const adminName =
        window.userSession?.username || window.userSession?.email || 'admin';

      // ✅ Update profile với approval_status = 'edit' + lưu yêu cầu chỉnh sửa
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          approval_status: 'edit',
          edit_comment: requirements.trim(), // Lưu ghi chú
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);

      if (error) throw error;

      // Đóng modal
      $('#modal-edit-requirements').modal('hide');

      // Reset biến tạm
      window.tempEditProfileId = null;

      // Refresh UI (Cập nhật lại bảng để thấy chữ "Yêu cầu sửa" đỏ chót)
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof renderDashboard === 'function') {
        renderDashboard();
      }
      if (typeof updateRecentReportsTable === 'function') {
        updateRecentReportsTable();
      }
    } catch (err) {
      console.error('❌ Lỗi submitEditRequirements:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // --- Status Helper Functions (Client-side) ---
  function getStatusTextClient(status) {
    if (status == 'approved') return 'approved';
    if (status == 'pending') return 'pending';
    if (status == 'edit') return 'edit';
    return status || '';
  }

  function getStatusClassClient(status) {
    if (status == 'approved') return 'status-approved';
    if (status == 'pending') return 'status-pending';
    if (status == 'edit') return 'status-edit';
    return 'status-pending';
  }
  // --- Filtering Logic (Keep existing) ---
  // Lưu function filter vào biến để dễ remove
  let dateFilterFn = null;

  function applyDateFilter(startDate, endDate) {
    console.log('=== FILTER INPUT ===', startDate, endDate);

    // Lấy dataTable instance an toàn
    const table = $('#report-table').DataTable();
    if (!table) {
      console.warn('DataTable not initialized');
      return;
    }

    // Xóa filter cũ
    if (dateFilterFn) {
      const idx = $.fn.dataTable.ext.search.indexOf(dateFilterFn);
      if (idx > -1) $.fn.dataTable.ext.search.splice(idx, 1);
    }

    // Nếu không có filter, vẽ lại table
    if (!startDate && !endDate) {
      table.draw();
      return;
    }

    // === PARSE NGÀY LỌC ===
    const parseFilterDate = (str) => {
      if (!str) return null;
      const parts = str.split(/[/\-]/);
      if (parts.length !== 3) return null;

      let [d, m, y] = parts.map(Number);
      if (y < 100) y += 2000; // dd/mm/yy → yyyy

      if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
      return new Date(y, m - 1, d);
    };

    const fromDate = startDate ? parseFilterDate(startDate) : null;
    const toDate = endDate ? parseFilterDate(endDate) : null;

    const fromTime = fromDate
      ? new Date(
          fromDate.getFullYear(),
          fromDate.getMonth(),
          fromDate.getDate(),
          0,
          0,
          0
        ).getTime()
      : 0;
    const toTime = toDate
      ? new Date(
          toDate.getFullYear(),
          toDate.getMonth(),
          toDate.getDate(),
          23,
          59,
          59
        ).getTime()
      : Infinity;

    console.log('Filter range:', new Date(fromTime), '→', new Date(toTime));

    // === FILTER FUNCTION ===
    dateFilterFn = function (settings, data, dataIndex) {
      // ✅ FIX 1: Dùng column index ĐÚNG (cột 2 = Ngày cập nhật)
      const dateCell = data[2];

      // ✅ FIX 2: Parse ngày từ định dạng toLocaleDateString('vi-VN')
      // Format: "27/5/2026" hoặc "27/05/2026" (KHÔNG có giờ)
      const dateMatch = dateCell?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dateMatch) return true; // Nếu không parse được, giữ lại hàng

      const [_, day, month, year] = dateMatch.map(Number);
      const rowDate = new Date(year, month - 1, day);
      const rowTime = rowDate.getTime();

      // So sánh
      const pass = rowTime >= fromTime && rowTime <= toTime;
      return pass;
    };

    $.fn.dataTable.ext.search.push(dateFilterFn);
    table.draw();
    console.log('✅ Filter applied!');
  }

  // Events
  $('#btn-filter').on('click', function () {
    console.log('=== BUTTON CLICKED ===');
    applyDateFilter($('#filter-date-start').val(), $('#filter-date-end').val());
  });

  $('#btn-clear-filter').on('click', function () {
    console.log('=== CLEAR BUTTON ===');
    $('#filter-date-start, #filter-date-end').val('');
    applyDateFilter(null, null);
  });
  // ==========================================
  // HÀM MỞ VÀ ĐIỀN DỮ LIỆU VÀO FORM (TỐI ƯU & BỌC THÉP)
  // ==========================================

  async function fetchAndRenderProfileHistory(userId) {
    if (!userId) {
      console.warn('Không có userId, bỏ qua fetch lịch sử.');
      return;
    }

    const trainingBody = document.getElementById('profile-training-body');
    const expBody = document.getElementById('profile-rrt-exp-body');

    if (trainingBody)
      trainingBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">Đang tải dữ liệu...</td></tr>';
    if (expBody)
      expBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">Đang tải dữ liệu...</td></tr>';

    try {
      // 1. TẢI DỮ LIỆU ĐIỀU ĐỘNG
      const { data: expHistory, error: expErr } = await window.supabaseClient
        .from('deployment_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expErr) throw expErr;

      let finalExpHistory = expHistory || [];
      if (finalExpHistory.length > 0) {
        const incidentIds = [
          ...new Set(finalExpHistory.map((h) => h.incident_id).filter(Boolean)),
        ];
        if (incidentIds.length > 0) {
          const { data: incData } = await window.supabaseClient
            .from('incidents')
            .select('id, event_name, status')
            .in('id', incidentIds);

          if (incData) {
            finalExpHistory = finalExpHistory.map((h) => {
              const match = incData.find((i) => i.id === h.incident_id);
              return { ...h, incident_info: match || null };
            });
          }
        }
      }

      // 2. TẢI DỮ LIỆU ĐÀO TẠO
      const { data: trainingHistory, error: trainErr } =
        await window.supabaseClient
          .from('training_records')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

      if (trainErr) throw trainErr;

      let finalTrainHistory = trainingHistory || [];
      if (finalTrainHistory.length > 0) {
        const courseIds = [
          ...new Set(finalTrainHistory.map((h) => h.course_id).filter(Boolean)),
        ];
        if (courseIds.length > 0) {
          const { data: courseData } = await window.supabaseClient
            .from('training_courses')
            .select('id, course_name, training_date, description, status')
            .in('id', courseIds);

          if (courseData) {
            finalTrainHistory = finalTrainHistory.map((h) => {
              const match = courseData.find((c) => c.id === h.course_id);
              return { ...h, course_info: match || null };
            });
          }
        }
      }

      // 3. ĐỔ DỮ LIỆU RA GIAO DIỆN
      if (trainingBody) {
        trainingBody.innerHTML = '';
        if (finalTrainHistory.length === 0) {
          trainingBody.innerHTML =
            '<tr><td colspan="4" class="text-center text-muted">Chưa có dữ liệu.</td></tr>';
        } else {
          finalTrainHistory.forEach((h) => {
            const courseInfo = h.course_info || {};
            const courseName =
              courseInfo.course_name || 'Khóa học không tồn tại';
            const rawDate = courseInfo.training_date || h.created_at;
            const dateStr = rawDate
              ? new Date(rawDate).toLocaleDateString('vi-VN')
              : 'N/A';
            const noteStr = h.note || courseInfo.description || '';

            const statusVal = (
              h.result ||
              courseInfo.status ||
              ''
            ).toLowerCase();
            let badgeClass = 'bg-warning text-dark';
            let displayStatus = 'Đang xử lý';

            if (['pass', 'completed', 'open'].includes(statusVal)) {
              badgeClass = 'bg-success';
              displayStatus = statusVal === 'open' ? 'Đang mở' : 'Hoàn thành';
            } else if (statusVal === 'fail') {
              badgeClass = 'bg-danger';
              displayStatus = 'Chưa đạt';
            }

            trainingBody.insertAdjacentHTML(
              'beforeend',
              `
              <tr>
                  <td>${window.escapeHtml?.(courseName) || courseName}</td>
                  <td>${dateStr}</td>
                  <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                  <td><small>${
                    window.escapeHtml?.(noteStr) || noteStr
                  }</small></td>
              </tr>
            `
            );
          });
        }
      }

      if (expBody) {
        expBody.innerHTML = '';
        if (finalExpHistory.length === 0) {
          expBody.innerHTML =
            '<tr><td colspan="4" class="text-center text-muted">Chưa có nhiệm vụ.</td></tr>';
        } else {
          finalExpHistory.forEach((h) => {
            const incInfo = h.incident_info || {};
            const eventName = incInfo.event_name || 'Sự kiện không tồn tại';
            const incidentIdStr = h.incident_id
              ? String(h.incident_id).substring(0, 8)
              : 'N/A';

            const role = h.action_type || 'Thành viên';
            const notes = h.reason || '';
            const startDate = h.created_at
              ? new Date(h.created_at).toLocaleDateString('vi-VN')
              : 'N/A';

            const incidentStatus = (incInfo.status || '').toLowerCase();
            const actionBadge =
              incidentStatus === 'active'
                ? '<span class="badge bg-success">🔥 Đang tham gia</span>'
                : '<span class="badge bg-primary">🏁 Hoàn thành</span>';

            expBody.insertAdjacentHTML(
              'beforeend',
              `
              <tr>
                  <td><b>${
                    window.escapeHtml?.(eventName) || eventName
                  }</b><br><small class="text-muted">#${incidentIdStr}</small></td>
                  <td><b>${window.escapeHtml?.(role) || role}</b></td>
                  <td class="text-center">${actionBadge}</td>
                  <td><b>${startDate}</b><br><small class="text-muted">${
                window.escapeHtml?.(notes) || notes
              }</small></td>
              </tr>
            `
            );
          });
        }
      }
    } catch (error) {
      console.error('Lỗi khi fetch dữ liệu lịch sử:', error);
      if (trainingBody)
        trainingBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu.</td></tr>';
      if (expBody)
        expBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu.</td></tr>';
    }
  }

  // ========================================================================
  // VIEW REPORT - FIX: Schema + Null Safety + Error Handling + UX
  // ========================================================================
  window.viewReport = async function (profileId) {
    console.log('🔍 [viewReport] Starting with profileId:', profileId);

    // ✅ 1. VALIDATE INPUT
    if (!profileId || profileId === 'undefined' || profileId === '') {
      console.warn('⚠️ [viewReport] Invalid profileId');
      showToast('ID Hồ sơ không hợp lệ.', 'error');
      return;
    }

    // ✅ 2. SHOW LOADING
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      console.log('📡 [viewReport] Fetching data from Supabase...');

      // ✅ 3. FETCH DATA IN PARALLEL - CHỈ LẤY CỘT CÓ TRONG SCHEMA
      const [profileRes, qualRes] = await Promise.all([
        window.supabaseClient
          .from('profiles')
          .select(
            `
          id, email, full_name, phone, role, team, position,
          department, deployment_status, approval_status,
          updated_at, created_at, academic, academic_level,
          languages, languages_level, employeestatus,
          ward, address, dob, gender, fax, edit_comment
        `
          )
          .eq('id', profileId)
          .maybeSingle(), // ✅ Dùng maybeSingle để tránh lỗi nếu không tìm thấy
        window.supabaseClient
          .from('rrt_qualifications')
          .select('*')
          .eq('profile_id', profileId),
      ]);

      // ✅ 4. HANDLE PROFILE ERRORS
      if (profileRes.error) {
        console.error('❌ [viewReport] Profile fetch error:', profileRes.error);
        throw new Error(`Không tìm thấy hồ sơ: ${profileRes.error.message}`);
      }

      const profile = profileRes.data;
      if (!profile) {
        throw new Error('Hồ sơ không tồn tại hoặc đã bị xóa.');
      }
      console.log('✅ [viewReport] Profile loaded:', profile.id);

      // ✅ 5. HANDLE QUALIFICATIONS
      const qual = qualRes.data?.[0] || {};
      console.log('📋 [viewReport] Qualifications:', qual?.id || 'No record');

      // ✅ 6. PARSE SKILLS FROM JSONB SAFELY
      let skills = {};
      if (qual.skills) {
        try {
          skills =
            typeof qual.skills === 'string'
              ? JSON.parse(qual.skills)
              : qual.skills;
          console.log(
            '🧠 [viewReport] Skills parsed:',
            Object.keys(skills).length
          );
        } catch (e) {
          console.error('❌ [viewReport] Skills parse error:', e);
          skills = {};
        }
      }

      // ✅ 7. GET DOM ELEMENTS
      const modal = document.getElementById('modal-rrtForm');
      const reportForm = document.getElementById('rrtForm');

      if (!modal || !reportForm) {
        console.error('❌ [viewReport] Modal/Form not found in DOM');
        throw new Error('Không tìm thấy giao diện biểu mẫu.');
      }

      // ✅ 8. RESET FORM & SET EDIT MODE
      reportForm.reset();
      window.isEditMode = true;
      window.currentEditingProfileId = profileId; // ✅ QUAN TRỌNG: Lưu ID để check email trùng khi submit

      const modalTitle = document.getElementById('modal-title');
      if (modalTitle) modalTitle.textContent = '📑 Cập nhật hồ sơ RRT';

      console.log('🎨 [viewReport] Form reset, UI prepared');

      // ✅ 9. CACHE LAST VALUES FOR DROPDOWNS
      window.lastwardValue = profile.ward || '';
      window.lastfaxValue = profile.fax || '';
      window.lastdepartmentValue = profile.department || '';
      window.lastacademicValue = qual.academic || profile.academic || '';
      window.lastacademicLevelValue =
        qual.academic_level || profile.academic_level || '';
      window.lastlanguageValue = qual.languages || profile.languages || '';

      // ✅ 10. INIT DYNAMIC DROPDOWNS
      if (typeof createWardDropdown === 'function') {
        if (createWardDropdown.constructor?.name === 'AsyncFunction') {
          await createWardDropdown();
        } else {
          createWardDropdown();
        }
      }

      // ✅ 11. HELPER: SAFE SET VALUE WITH SELECT2 SUPPORT
      const setVal = (keys, value) => {
        let el = null;
        for (const key of keys) {
          el =
            document.getElementById(key) ||
            reportForm.querySelector(`[name="${key}"]`);
          if (el) break;
        }
        if (!el) return;

        el.value = value ?? '';

        // Trigger Select2 change if applicable
        if (
          typeof jQuery !== 'undefined' &&
          $(el).hasClass('select2-hidden-accessible')
        ) {
          $(el).trigger('change.select2');
        } else if (el.tagName === 'SELECT') {
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // ✅ 12. FILL PERSONAL INFO
      setVal(['fullName', 'rrt-fullname', 'ho_ten'], profile.full_name);
      setVal(['gender', 'rrt-gender', 'gioi_tinh'], profile.gender);
      setVal(['dob', 'rrt-dob', 'nam_sinh'], profile.dob);
      setVal(['phone', 'rrt-phone', 'so_dien_thoai'], profile.phone);
      setVal(['email', 'rrt-email'], profile.email);
      setVal(['fax', 'don_vi'], profile.fax);
      setVal(['department', 'khoa_phong'], profile.department);
      setVal(['employeeStatus', 'employeestatus'], profile.employeestatus);
      setVal(['address', 'rrt-address', 'dia_chi'], profile.address);

      // ✅ 13. FILL PROFESSIONAL INFO
      setVal(['academic', 'chuyen_nganh'], qual.specialty || qual.academic);
      setVal(['academicLevel', 'cap_bac'], qual.academic_level);
      setVal(['language', 'ngoai_ngu'], qual.languages);
      setVal(['languageLevel', 'trinh_do_nn'], qual.languages_level);

      // ========================================================================
      // ✅ 14. FILL SKILLS - KEY MAP AT PARENT SCOPE
      // ========================================================================
      const jsonKeyMap = {
        skill_ungpho: 'emergency_response',
        skill_ruiro: 'risk_communication',
        skill_tamly: 'psycho_social',
        skill_dulieu: 'data_management',
        skill_dichte: 'epidemiology',
        skill_nhiemtrung: 'infection_control',
        skill_thinghiem: 'lab',
        skill_haucan: 'logistics',
        skill_vanhanh: 'operation_materials',
        skill_cabenh: 'case_management',
        skill_dinhduong: 'food_management',
        skill_nuoc: 'wash_management',
        skill_nguyhiem: 'hazardous_management',
        skill_anninh: 'security_management',
      };

      const fillSkills = (skillsData) => {
        console.log(
          '🔧 fillSkills called with:',
          Object.keys(skillsData).length,
          'skills'
        );

        Object.keys(jsonKeyMap).forEach((htmlBaseName) => {
          const dbKey = jsonKeyMap[htmlBaseName];
          const skillData = skillsData[dbKey] || {
            has_skill: false,
            level: '',
          };

          const radioCo = document.getElementById(`${htmlBaseName}_co`);
          const radioKhong = document.getElementById(`${htmlBaseName}_khong`);
          const levelSelect = document.getElementById(`${htmlBaseName}_level`);
          const container =
            document.getElementById(`${htmlBaseName}_container`) ||
            document.querySelector(`[data-skill="${htmlBaseName}"]`);

          if (!radioCo || !radioKhong) {
            console.warn(`⚠️ [${htmlBaseName}] Radio buttons not found!`);
            return;
          }

          // Show container
          if (container) {
            container.style.display = 'block';
            container.classList.remove('d-none', 'hidden', 'invisible');
          }

          if (skillData.has_skill) {
            radioCo.checked = true;
            radioCo.dispatchEvent(new Event('change', { bubbles: true }));

            if (levelSelect) {
              levelSelect.style.display = 'block';
              levelSelect.setAttribute('required', 'required');
              levelSelect.value = skillData.level || '';
              levelSelect.dispatchEvent(new Event('change', { bubbles: true }));

              if (
                typeof jQuery !== 'undefined' &&
                $(levelSelect).hasClass('select2-hidden-accessible')
              ) {
                $(levelSelect).trigger('change.select2');
              }
            }
          } else {
            radioKhong.checked = true;
            radioKhong.dispatchEvent(new Event('change', { bubbles: true }));

            if (levelSelect) {
              levelSelect.style.display = 'none';
              levelSelect.removeAttribute('required');
              levelSelect.value = '';
            }
          }
        });

        console.log('✅ fillSkills completed');
      };

      // ========================================================================
      // ✅ 15. SHOW MODAL + DELAYED SKILL FILL (FOR ANIMATION + SELECT2 INIT)
      // ========================================================================
      modal.style.display = 'block';
      modal.classList.add('show', 'd-block');
      modal.setAttribute('aria-hidden', 'false');

      // Wait for modal animation + Select2 init
      setTimeout(() => {
        console.log('🎨 [fillSkills] Starting skill fill...');
        fillSkills(skills);

        // Debug: Verify radio states
        Object.keys(jsonKeyMap).forEach((key) => {
          const radioCo = document.getElementById(`${key}_co`);
          const levelSelect = document.getElementById(`${key}_level`);
          console.log(
            `[${key}] Checked: ${radioCo?.checked}, Level: ${levelSelect?.value}`
          );
        });
      }, 300);

      // ========================================================================
      // ✅ 16. DISPLAY ATTACHMENT INFO (IF ANY) - KHÔNG DÙNG resume_url
      // ========================================================================
      // Lưu ý: profiles table không có cột resume_url, nên không hiển thị ở đây
      // File đính kèm nên lưu ở rrt_qualifications.file_url hoặc bảng khác
      const currentFileDisplay = document.getElementById('currentFileDisplay');
      if (currentFileDisplay) {
        // Nếu bạn có file_url trong qual, hiển thị ở đây:
        if (qual.file_url) {
          currentFileDisplay.innerHTML = `
          Đã đính kèm: <a href="${qual.file_url}" target="_blank" class="text-primary">
            <i class='bx bx-link'></i> Xem tệp
          </a>
        `;
        } else {
          currentFileDisplay.innerHTML = 'Chưa có tệp đính kèm.';
        }
      }

      // ========================================================================
      // ✅ 17. DISPLAY EDIT REQUIREMENTS (NẾU CÓ YÊU CẦU CHỈNH SỬA TỪ ADMIN)
      // ========================================================================
      const editRequirementsEl = document.getElementById(
        'edit-requirements-display'
      );

      if (editRequirementsEl) {
        // Kiểm tra điều kiện: Trạng thái là 'edit' VÀ có nội dung comment
        if (profile.approval_status === 'edit' && profile.edit_comment) {
          const commentClean =
            window.escapeHtml?.(profile.edit_comment) || profile.edit_comment;
          const reviewer = profile.reviewed_by || 'Quản trị viên';
          const reviewDate = profile.updated_at
            ? new Date(profile.updated_at).toLocaleString('vi-VN')
            : '';

          editRequirementsEl.innerHTML = `
            <div class="alert alert-warning border-start border-4 border-warning shadow-sm">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="alert-heading mb-0 fw-bold text-danger">
                  <i class='bx bx-error-circle'></i> YÊU CẦU CHỈNH SỬA TỪ ADMIN
                </h6>
                <small class="text-muted" style="font-size: 11px;">${reviewDate}</small>
              </div>
              <div class="mt-2 p-3 bg-white rounded border border-warning-subtle text-dark" style="white-space: pre-wrap; line-height: 1.6;">${commentClean.replace(
                /\n/g,
                '<br>'
              )}</div>
            </div>
          `;
          editRequirementsEl.style.display = 'block';

          // Tự động cuộn lên đầu Modal để User thấy ngay cảnh báo
          const modalBody = modal.querySelector('.modal-body');
          if (modalBody) modalBody.scrollTop = 0;
        } else {
          editRequirementsEl.innerHTML = '';
          editRequirementsEl.style.display = 'none';
        }
      }

      // ========================================================================
      // ✅ 18. FETCH & RENDER PROFILE HISTORY
      // ========================================================================
      console.log('🚀 [viewReport] Loading profile history...');
      if (typeof fetchAndRenderProfileHistory === 'function') {
        await fetchAndRenderProfileHistory(profileId);
      }

      console.log('✅ [viewReport] All steps completed successfully!');
    } catch (err) {
      console.error('❌ [viewReport] Error:', err);
      showToast(
        'Lỗi tải báo cáo: ' + (err.message || 'Không xác định'),
        'error'
      );
    } finally {
      // ✅ ALWAYS HIDE LOADING
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // --- Create/Edit Modal Management ---
  const btnCreateReport = document.getElementById('btn-create-report');
  const modalReportForm = document.getElementById('modal-rrtForm');
  const reportForm = document.getElementById('rrtForm');
  const modalTitle = document.getElementById('modal-title');

  let isEditMode = false; // toàn cục, true = Sửa, false = Tạo mới
  let isSubmitting = false; // Ngăn submit nhiều lần

  // ==========================================
  // 1. HÀM ĐÓNG MODAL VÀ RESET FORM
  // ==========================================
  window.closeModal = function (modalId) {
    if (document.activeElement) {
      document.activeElement.blur();
    }
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    // 1. Đóng Bootstrap instance
    const bsModal = bootstrap.Modal?.getInstance(modalEl);
    if (bsModal) {
      bsModal.hide();
      setTimeout(() => {
        try {
          bsModal.dispose();
        } catch (e) {}
      }, 150);
    }

    // 2. FORCE ẨN MODAL & XÓA BACKDROP
    modalEl.classList.remove('show', 'd-block');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }, 100);

    // 3. Reset form tương ứng
    if (modalId === 'modal-official-report') {
      window.cachedPlanData = null;
      const form = modalEl.querySelector('form');
      if (form) form.reset();
    }
    console.log('✅ Modal closed & cleaned:', modalId);
  };

  // ✅ Fix click outside modal
  window.addEventListener('click', function (event) {
    const modalReportForm = document.getElementById('modal-rrtForm');

    // Check nếu click trúng backdrop (không phải modal content)
    if (event.target === modalReportForm) {
      console.log('🖱️ Click outside modal - closing...');

      // Đóng modal với cleanup đầy đủ
      closeModal('modal-rrtForm');
    }
  });

  // ==========================================
  // 2. XỬ LÝ NÚT "TẠO MỚI HỒ SƠ"
  // ==========================================
  if (btnCreateReport) {
    btnCreateReport.addEventListener('click', function () {
      modalTitle.textContent = '📑 Biểu mẫu đăng ký RRT';
      isEditMode = false;

      reportForm.reset();

      // --- XÓA TRẮNG BẢNG LỊCH SỬ/KINH NGHIỆM ---
      const trainingBody = document.getElementById('profile-training-body');
      if (trainingBody)
        trainingBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Dữ liệu lịch sử sẽ hiển thị sau khi hồ sơ được tạo.</td></tr>';

      const expBody = document.getElementById('profile-rrt-exp-body');
      if (expBody)
        expBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Dữ liệu thực chiến sẽ hiển thị sau khi hồ sơ được tạo.</td></tr>';

      // Reset các dropdown phụ thuộc (Xóa cache cũ và tạo lại)
      if (typeof createWardDropdown === 'function') {
        window.lastwardValue = '';
        window.lastdepartmentValue = '';
        window.lastdepartmentAPValue = '';
        window.lastemployeeStatusValue = '';
        window.lastacademicValue = '';
        window.lastacademicLevelValue = '';
        window.lastfaxValue = '';
        createWardDropdown();
      }

      modalReportForm.style.display = 'block';
      window.scrollTo(0, 0);
    });
  }

  // ==========================================
  // 3. XỬ LÝ SỰ KIỆN SUBMIT FORM RRT (ĐÃ FIX - CHUẨN XÁC)
  // ==========================================
  if (reportForm) {
    reportForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (isSubmitting) return; // Chống click nhiều lần
      isSubmitting = true;

      const submitBtn = reportForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      try {
        // =========================================================
        // 1. XÁC ĐỊNH CHÍNH XÁC ID HỒ SƠ ĐANG CẦN CẬP NHẬT
        // =========================================================
        const {
          data: { user },
          error: userErr,
        } = await supabaseClient.auth.getUser();
        if (userErr || !user)
          throw new Error('Vui lòng đăng nhập lại để gửi biểu mẫu.');

        // NẾU LÀ ADMIN ĐANG EDIT: Lấy ID của người đang được edit từ biến toàn cục
        // NẾU LÀ USER TỰ TẠO/EDIT: Dùng ID của chính họ
        const targetProfileId =
          window.isEditMode && window.currentEditingProfileId
            ? window.currentEditingProfileId
            : user.id;

        // =========================================================
        // 2. LẤY TỌA ĐỘ & MÃ XÃ TỰ ĐỘNG
        // =========================================================
        const userLoc = await new Promise((resolve) => {
          if (typeof getUserLocation === 'function') {
            getUserLocation((loc) => resolve(loc));
          } else {
            console.warn('⚠️ getUserLocation not defined');
            resolve({ lat: null, lng: null });
          }
        });

        let autoMaXa = null;
        if (
          userLoc.lat &&
          userLoc.lng &&
          typeof window.findWardByCoordinates === 'function'
        ) {
          if (!window.appState.mapGeoData) {
            console.warn('⚠️ GeoJSON chưa sẵn sàng, đang tải lại...');
            await window.loadGeoJSON();
          }
          const wardInfo = window.findWardByCoordinates(
            userLoc.lat,
            userLoc.lng
          );
          if (wardInfo) {
            autoMaXa = wardInfo.maXa;
            console.log(`📍 Tìm thấy mã xã: ${wardInfo.tenXa} (${autoMaXa})`);
          }
        }

        // =========================================================
        // 3. THU THẬP DỮ LIỆU CƠ BẢN (profiles)
        // =========================================================
        const getVal = (id) =>
          document.getElementById(id)?.value?.trim() || null;
        const finalMaXa = autoMaXa || getVal('wardCode') || getVal('ward');

        const profileData = {
          id: targetProfileId, // DÙNG ID ĐÃ ĐƯỢC XÁC ĐỊNH Ở BƯỚC 1
          full_name: getVal('fullName'),
          gender: getVal('gender'),
          dob: getVal('dob'),
          phone: getVal('phone'),
          email: getVal('email'),
          address: getVal('address'),
          ward: getVal('ward'),
          ma_xa: finalMaXa,
          latitude: userLoc.lat,
          longitude: userLoc.lng,
          fax: getVal('fax'),
          department: getVal('department'),
          employeestatus: getVal('employeeStatus'),
          academic: getVal('academic'),
          academic_level: getVal('academicLevel'),
          languages: getVal('language'),
          languages_level: getVal('languageLevel'),
          // role: 'user', // <-- XÓA DÒNG NÀY ĐI
          approval_status: 'pending', // Luôn đưa về pending khi submit (cần Admin duyệt lại)
          updated_at: new Date().toISOString(),
        };

        if (!profileData.full_name) throw new Error('Vui lòng nhập Họ Tên.');
        if (!profileData.email) throw new Error('Vui lòng nhập Email.');

        // ==========================================
        // 4. KIỂM TRA EMAIL TRÙNG (AN TOÀN HƠN)
        // ==========================================
        const currentEmail = profileData.email.toLowerCase().trim();

        // Quét DB để xem email này đã tồn tại chưa
        const { data: existingUser, error: emailCheckErr } =
          await supabaseClient
            .from('profiles')
            .select('id, full_name, email')
            .eq('email', currentEmail)
            .maybeSingle();

        if (emailCheckErr)
          console.warn('⚠️ Lỗi kiểm tra email:', emailCheckErr.message);

        // Nếu tìm thấy một người xài email này, VÀ người đó KHÔNG PHẢI LÀ targetProfileId đang sửa
        if (existingUser && existingUser.id !== targetProfileId) {
          const holderName =
            existingUser.full_name || existingUser.email || 'ai đó';
          throw new Error(
            `Email "${profileData.email}" đã được sử dụng bởi ${holderName}!`
          );
        }

        // =========================================================
        // 5. THU THẬP KỸ NĂNG (rrt_qualifications)
        // =========================================================
        const getSkillData = (skillName) => {
          const radio = document.querySelector(
            `input[name="${skillName}"]:checked`
          );
          const hasSkill = radio
            ? radio.value === 'Có' || radio.value === 'Yes'
            : false;
          let levelValue = null;
          if (hasSkill) {
            const levelSelect = document.getElementById(`${skillName}_level`);
            if (levelSelect) levelValue = levelSelect.value.trim() || null;
          }
          return { has_skill: hasSkill, level: levelValue };
        };

        const skillsJSON = {
          emergency_response: getSkillData('skill_ungpho'),
          risk_communication: getSkillData('skill_ruiro'),
          psycho_social: getSkillData('skill_tamly'),
          data_management: getSkillData('skill_dulieu'),
          epidemiology: getSkillData('skill_dichte'),
          infection_control: getSkillData('skill_nhiemtrung'),
          lab: getSkillData('skill_thinghiem'),
          logistics: getSkillData('skill_haucan'),
          operation_materials: getSkillData('skill_vanhanh'),
          case_management: getSkillData('skill_cabenh'),
          food_management: getSkillData('skill_dinhduong'),
          wash_management: getSkillData('skill_nuoc'),
          hazardous_management: getSkillData('skill_nguyhiem'),
          security_management: getSkillData('skill_anninh'),
        };

        const qualData = {
          profile_id: targetProfileId, // DÙNG CHUẨN ID
          academic: getVal('academic'),
          academic_level: getVal('academicLevel'),
          languages: getVal('language'),
          languages_level: getVal('languageLevel'),
          skills: skillsJSON,
          updated_at: new Date().toISOString(),
        };

        // =========================================================
        // 6. XỬ LÝ FILE ĐÍNH KÈM (Supabase Storage)
        // =========================================================
        const fileInput = document.querySelector(
          'input[type="file"][name="reportFile"]'
        );
        if (fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          const MAX_SIZE = 10 * 1024 * 1024; // 10MB
          if (file.size > MAX_SIZE)
            throw new Error('File quá lớn. Vui lòng chọn file dưới 10MB.');

          const fileExt = file.name.split('.').pop();
          const fileName = `profile_${targetProfileId}_${Date.now()}.${fileExt}`;
          const filePath = `resumes/${fileName}`;

          const { error: uploadError } = await supabaseClient.storage
            .from('documents')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

          if (uploadError)
            throw new Error('Lỗi upload file: ' + uploadError.message);

          const { data: publicUrlData } = supabaseClient.storage
            .from('documents')
            .getPublicUrl(filePath);

          qualData.file_url = publicUrlData.publicUrl;
        }

        // =========================================================
        // 7. GỬI DỮ LIỆU LÊN SUPABASE (UPDATE)
        // =========================================================
        // Nếu là edit mode thì update, nếu tạo mới (chưa có) thì nên dùng upsert
        if (window.isEditMode) {
          const { error: errProfile } = await supabaseClient
            .from('profiles')
            .update(profileData)
            .eq('id', targetProfileId);

          if (errProfile)
            throw new Error('Lỗi cập nhật hồ sơ: ' + errProfile.message);
        } else {
          // Với tài khoản tự cập nhật lần đầu
          const { error: errProfile } = await supabaseClient
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' });

          if (errProfile)
            throw new Error('Lỗi lưu mới hồ sơ: ' + errProfile.message);
        }

        const { error: errQual } = await supabaseClient
          .from('rrt_qualifications')
          .upsert(qualData, { onConflict: 'profile_id' });

        if (errQual) throw new Error('Lỗi lưu kỹ năng: ' + errQual.message);

        // =========================================================
        // 8. HOÀN TẤT
        // =========================================================
        showToast('✅ Đã lưu hồ sơ RRT thành công!', 'success');

        if (typeof closeModal === 'function') {
          closeModal('modal-rrtForm');
        } else {
          const modalEl = document.getElementById('modal-rrtForm');
          if (modalEl && typeof bootstrap !== 'undefined') {
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
          }
        }

        if (typeof window.renderRRTTable === 'function') {
          await window.renderRRTTable();
        }
      } catch (err) {
        console.error('❌ Lỗi khi submit Form:', err);
        showToast(err.message, 'error');
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
      }
    });
  }
  // =====  Chức năng In Báo cáo =====
  const reportModal = document.getElementById('modal-rrtForm');

  // ==========================================
  // IN PDF BẰNG TRÌNH DUYỆT (PRINT)
  // ==========================================
  let isPrinting = false;
  const btnPrintReport = document.getElementById('btn-print-report');
  const rrtRecordIdInput = document.getElementById('rrtRecordId');

  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', function () {
      if (isPrinting) {
        showToast('Đang xử lý, vui lòng đợi...', 'info');
        return;
      }

      const rrtRecordId = rrtRecordIdInput ? rrtRecordIdInput.value : '';
      if (!rrtRecordId) {
        showToast('Không thể in biểu mẫu. Mã biểu mẫu không hợp lệ.', 'error');
        return;
      }

      isPrinting = true;
      btnPrintReport.disabled = true;
      showToast('Đang chuẩn bị trang in...', 'info');

      // Tạo một cửa sổ in tạm thời để hiển thị dữ liệu đẹp mắt hơn
      // Hoặc đơn giản là dùng chức năng in của trình duyệt (Ctrl + P)
      setTimeout(() => {
        window.print();
        isPrinting = false;
        btnPrintReport.disabled = false;
      }, 500);
    });
  }

  // ==========================================
  // XUẤT EXCEL BẰNG SHEETJS
  // ==========================================
  const btnExportExcel = document.getElementById('btn-export-excel');
  let isExportingExcel = false;

  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', async function () {
      if (isExportingExcel) {
        showToast('Đang xuất Excel, vui lòng đợi...', 'info');
        return;
      }
      const rrtRecordId = rrtRecordIdInput ? rrtRecordIdInput.value : '';
      if (!rrtRecordId) {
        showToast(
          'Không thể xuất tệp Excel. ID báo cáo không hợp lệ.',
          'error'
        );
        return;
      }

      isExportingExcel = true;
      btnExportExcel.disabled = true;
      showToast('Đang tạo tệp Excel...', 'info');

      try {
        if (typeof XLSX === 'undefined') {
          throw new Error(
            'Thư viện SheetJS chưa được tải. Không thể xuất Excel.'
          );
        }

        // Lấy dữ liệu báo cáo từ Supabase
        const { data, error } = await supabaseClient
          .from('profiles') // Thay đổi nếu tên bảng của bạn khác
          .select('*')
          .eq('id', rrtRecordId)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Không tìm thấy dữ liệu báo cáo này.');

        // Tạo Worksheet từ JSON
        const worksheet = XLSX.utils.json_to_sheet([data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report_Data');

        // Xuất file
        XLSX.writeFile(workbook, `Report_${rrtRecordId}.xlsx`);
        showToast('Đã tạo thành công tệp Excel!', 'success');
      } catch (err) {
        console.error('Lỗi xuất Excel:', err);
        showToast('Lỗi khi xuất Excel: ' + err.message, 'error');
      } finally {
        isExportingExcel = false;
        btnExportExcel.disabled = false;
      }
    });
  }

  // ==========================================
  // LẤY DANH SÁCH THÀNH VIÊN TỪ LOCAL STATE
  // ==========================================
  // Thay thế việc gọi server bằng cách lấy dữ liệu sẵn có
  window.getMembersForEmergency = function () {
    return new Promise((resolve, reject) => {
      // Kiểm tra quyền
      if (!window.userSession || !window.userSession.role.includes('admin')) {
        showToast('Bạn không có quyền xem danh sách này!', 'error');
        reject(new Error('No permission'));
        return;
      }

      // Kiểm tra appState
      if (!window.appState || !window.appState.users) {
        showToast('Dữ liệu nhân sự chưa được tải!', 'error');
        reject(new Error('Data not loaded'));
        return;
      }

      // Trả về danh sách ngay lập tức
      resolve(window.appState.users);
    });
  };
  // A global variable to store the list of members
  window.memberList = [];
  window.tempSelectedEmails = [];
  window.tempIncidentDetails = {};
  const nowPlus30 = new Date();
  nowPlus30.setMinutes(nowPlus30.getMinutes() + 30);
  // Main function to load and display the member list
  // ============================================================
  // LOGIC TRANG EMERGENCY (ĐIỀU ĐỘNG SỰ CỐ) - TỰ ĐỘNG NẠP DỮ LIỆU
  // ============================================================
  window.renderEmergencyPage = async function () {
    let teamData = window.appState.teamData || [];
    let rosters = window.appState.roster_schedules || [];

    // 1. TỰ ĐỘNG KIỂM TRA VÀ NẠP DỮ LIỆU NẾU THIẾU
    const missingTeam = teamData.length === 0;
    const missingRosters = rosters.length === 0;

    if (missingTeam || missingRosters) {
      console.log(
        '🚀 Trang Điều động: Phát hiện thiếu dữ liệu, đang tải bổ sung...'
      );
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      try {
        const fetchTasks = [];

        // Nếu thiếu danh sách nhân sự, gọi hàm tải nhân sự
        if (missingTeam && typeof window.renderTeamTable === 'function') {
          fetchTasks.push(window.renderTeamTable());
        }

        // Nếu thiếu lịch trực, gọi hàm tải lịch trực
        if (missingRosters && typeof window.loadRosterData === 'function') {
          fetchTasks.push(window.loadRosterData());
        }

        // Chờ cho cả 2 dữ liệu được tải xong song song
        await Promise.all(fetchTasks);

        // Cập nhật lại biến từ appState sau khi đã tải xong
        teamData = window.appState.teamData || [];
        rosters = window.appState.roster_schedules || [];
      } catch (err) {
        console.error('❌ Lỗi nạp dữ liệu cho trang Điều động:', err);
        showToast('Lỗi tải dữ liệu. Vui lòng F5 lại trang.', 'error');
      } finally {
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
      }

      // Nếu tải xong mà hệ thống vẫn không có Đội nào (database trống), thì dừng
      if (teamData.length === 0) return;
    }

    // ==========================================
    // 2. Logic kiểm tra Lịch trực Hôm nay (ĐÃ BỌC THÉP MÚI GIỜ)
    // ==========================================
    const today = new Date();
    // Tạo chuỗi YYYY-MM-DD an toàn theo giờ Local (Việt Nam)
    const todayStr =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');

    let onDutyTeam = null;
    let onDutyShift = null;

    rosters.forEach((r) => {
      if (!r.duty_date) return;

      const dutyDateStr = String(r.duty_date).split('T')[0];

      // So sánh chuỗi ngày + Nới lỏng kiểm tra roster
      if (
        dutyDateStr === todayStr &&
        (!r.shift_type || r.shift_type === 'roster')
      ) {
        onDutyTeam = r.team_name || 'Không tên';
        onDutyShift = r;
      }
    });

    // ==========================================
    // 3. Cập nhật Giao diện Alert Box
    // ==========================================
    const alertBox = document.getElementById('on-duty-alert');
    const alertTitle = document.getElementById('on-duty-title');
    const alertDesc = document.getElementById('on-duty-desc');
    const alertAction = document.getElementById('on-duty-action');

    if (onDutyTeam) {
      alertBox.className =
        'alert alert-success d-flex align-items-center justify-content-between shadow-sm mb-4';
      alertBox.style.borderLeft = '5px solid #198754';

      const onDutyMembers = teamData.filter((u) => u.team === onDutyTeam);
      const memberNames =
        onDutyMembers.length > 0
          ? onDutyMembers
              .map((m) => m.full_name || m.username || m.email)
              .join(', ')
          : 'Chưa có thành viên nào';

      alertTitle.innerHTML = `<i class='bx bx-calendar-check'></i> ĐỘI TRỰC HÔM NAY: <b>${onDutyTeam}</b>`;
      alertDesc.innerHTML = `<strong>Danh sách:</strong> ${memberNames}`;
      alertAction.innerHTML = `<button class="btn btn-success btn-sm fw-bold" onclick="autoSelectTeam('${onDutyTeam}')"><i class='bx bx-check-double'></i> Chọn toàn bộ ${onDutyTeam}</button>`;
    } else {
      alertBox.className =
        'alert alert-warning d-flex align-items-center justify-content-between shadow-sm mb-4';
      alertBox.style.borderLeft = '5px solid #ffc107';
      alertTitle.innerHTML = `<i class='bx bx-error'></i> KHÔNG CÓ LỊCH TRỰC HÔM NAY`;
      alertDesc.innerHTML = `Vui lòng sử dụng bộ lọc bên dưới để chọn nhân sự phù hợp.`;
      alertAction.innerHTML = ``;
    }

    // 4. Render DataTable
    if ($.fn.DataTable.isDataTable('#memberListTable')) {
      $('#memberListTable').DataTable().clear().destroy();
    }

    const tbody = document.getElementById('memberListTable-body');
    tbody.innerHTML = '';

    const teamSet = new Set(
      teamData
        .map((m) => m.team)
        .filter((t) => t && String(t).trim() !== '' && t !== 'No team')
    );
    const teamSelect = document.getElementById('emer-filter-team');
    if (teamSelect) {
      teamSelect.innerHTML = '<option value="all">-- Tất cả Đội --</option>';
      [...teamSet].sort().forEach((t) => {
        teamSelect.innerHTML += `<option value="${t}">${t}</option>`;
      });
    }

    teamData.forEach((m) => {
      const name = m.full_name || m.username || m.email;
      const position = m.position || 'No position';
      const posLower = String(position).toLowerCase();

      let posBadge = `<span class="badge bg-secondary">${
        position === 'No position' ? 'Chưa phân công' : position
      }</span>`;
      if (posLower.includes('leader'))
        posBadge = `<span class="badge bg-danger">Đội trưởng</span>`;
      else if (posLower.includes('epidemic'))
        posBadge = `<span class="badge bg-info text-dark">Cán bộ Dịch tễ</span>`;
      else if (posLower.includes('member'))
        posBadge = `<span class="badge bg-primary">Cán bộ Lấy mẫu</span>`;
      else if (posLower.includes('engineer'))
        posBadge = `<span class="badge bg-dark text-white">Cán bộ Xử lý MT</span>`;
      else if (posLower.includes('media'))
        posBadge = `<span class="badge bg-success text-white">Cán bộ Truyền thông</span>`;
      else if (posLower.includes('logistic'))
        posBadge = `<span class="badge bg-secondary text-white">Hậu cần</span>`;
      else if (posLower.includes('driver'))
        posBadge = `<span class="badge bg-warning text-dark">Lái xe</span>`;

      const positionCell = `<span style="display:none;">${position}</span>${posBadge}`;

      let rankHtml = '<span class="badge bg-secondary">N/A</span>';
      try {
        if (typeof window.calculateRRTLevel === 'function')
          rankHtml = window.calculateRRTLevel(m);
      } catch (e) {}

      const row = `
          <tr>
              <td class="text-center">
                  <input type="checkbox" class="member-checkbox form-check-input" value="${
                    m.email
                  }" data-id="${m.id}" data-team="${m.team || ''}">
              </td>
              <td class="fw-bold">
                  ${window.escapeHtml ? window.escapeHtml(name) : name} <br>
                  ${rankHtml}
              </td>
              <td>${m.team && m.team !== 'No team' ? m.team : '-'}</td>
              <td>${positionCell}</td> 
              <td>${m.phone || '-'}</td>
              <td>${m.academic_degree || m.academic || '-'}</td>
              <td>${m.department || '-'}</td>
              <td>${m.ward || '-'}</td>
          </tr>
      `;
      tbody.insertAdjacentHTML('beforeend', row);
    });

    const table = $('#memberListTable').DataTable({
      responsive: true,
      lengthMenu: [
        [10, 25, 50, -1],
        [10, 25, 50, 'All'],
      ],
      dom: 'frtip',
      order: [[2, 'asc']],
    });

    $('#emer-filter-team, #emer-filter-role')
      .off('change')
      .on('change', function () {
        const teamVal = $('#emer-filter-team').val();
        const roleVal = $('#emer-filter-role').val();

        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
          if (settings.nTable.id !== 'memberListTable') return true;
          const rowTeam = data[2];
          const rowPosContent = data[3];

          const matchTeam = teamVal === 'all' || rowTeam === teamVal;
          let matchRole = true;
          if (roleVal !== 'all') {
            matchRole = rowPosContent.includes(roleVal);
          }
          return matchTeam && matchRole;
        });

        table.draw();
        $.fn.dataTable.ext.search.pop();
      });

    $('#memberListTable')
      .off('change', '.member-checkbox')
      .on('change', '.member-checkbox', function () {
        updateSelectedCount();
      });

    updateSelectedCount();
  };

  // ============================================================
  // HELPER: TÍNH ĐIỂM & XẾP HẠNG THỰC CHIẾN (COMBAT RATING)
  // ============================================================
  window.calculateRRTLevel = function (member) {
    let score = 0;
    const username = String(member.username).toLowerCase();
    const email = String(member.email).toLowerCase();

    // 1. Cộng điểm Đào tạo (+1 điểm/khóa)
    const trainingRecords = window.appState.training?.records || [];
    trainingRecords.forEach((r) => {
      if (
        r.result === 'pass' &&
        (r.username.toLowerCase() === username ||
          r.username.toLowerCase() === email)
      ) {
        score += 1;
      }
    });

    // 2. Cộng điểm Thực chiến (+2 điểm/vụ)
    const history = window.appState.deploymentHistory || [];
    // Dùng Set để đếm số sự kiện duy nhất (tránh cộng trùng khi 1 người có nhiều log trong 1 sự kiện)
    const missions = new Set();
    history.forEach((h) => {
      if (
        (h.username.toLowerCase() === username ||
          h.username.toLowerCase() === email) &&
        (h.action === 'Mobilize' || h.action === 'Replace_In')
      ) {
        missions.add(h.incidentId);
      }
    });
    score += missions.size * 2;

    // 3. Cộng điểm Vai trò (+5 nếu là Leader)
    if (member.position === 'Leader') score += 5;
    if (member.position === 'Epidemic') score += 3;

    // 4. Trả về HTML Badge
    if (score > 15)
      return `<span class="badge bg-warning text-dark" title="Chuyên gia: ${score} pts">👑 Chuyên gia</span>`;
    if (score >= 7)
      return `<span class="badge bg-danger" title="Tinh nhuệ: ${score} pts">⭐ Tinh nhuệ</span>`;
    if (score >= 3)
      return `<span class="badge bg-primary" title="Chính quy: ${score} pts">🎖️ Chính quy</span>`;

    return `<span class="badge bg-light text-secondary border" title="Tân binh: ${score} pts">🛡️ Tân binh</span>`;
  };
  // ==========================================
  // CÁC HÀM HELPER ĐI KÈM
  // ==========================================
  function updateSelectedCount() {
    const table = $('#memberListTable').DataTable();
    const count = table.$('input.member-checkbox:checked').length;
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.textContent = count;
  }

  window.autoSelectTeam = function (teamName) {
    const table = $('#memberListTable').DataTable();
    table.search('').columns().search('').draw(); // Reset search
    $('#emer-filter-team').val(teamName).trigger('change'); // Filter team
    $('.member-checkbox:visible').prop('checked', true); // Tick
    updateSelectedCount();
    showToast(`Đã chọn tất cả thành viên ${teamName}`, 'success');
  };

  $('#selectAllMembers')
    .off('click')
    .on('click', function () {
      const isChecked = this.checked;
      const table = $('#memberListTable').DataTable();
      const rows = table.rows({ search: 'applied' }).nodes();
      $('input[type="checkbox"]', rows).prop('checked', isChecked);
      updateSelectedCount();
    });

  // Sự kiện khi tick từng dòng (để cập nhật số lượng)
  // Dùng 'change' trên body bảng để bắt sự kiện từ các trang khác khi chuyển trang
  $('#memberListTable tbody').on(
    'change',
    'input[type="checkbox"]',
    function () {
      // Nếu bỏ tick 1 cái thì bỏ tick "Chọn tất cả"
      if (!this.checked) {
        var el = $('#selectAllMembers').get(0);
        if (el && el.checked && 'indeterminate' in el) {
          el.indeterminate = true;
        }
      }
      updateSelectedCount();
    }
  );

  // Event listener for the "Select All" checkbox.
  document.addEventListener('change', function (event) {
    if (event.target.id === 'selectAllMembers') {
      const checkboxes = document.querySelectorAll(
        '#memberListTable input[type="checkbox"]'
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = event.target.checked;
      });
    }
  });

  // Sự kiện nút Kích Hoạt (ĐÃ SỬA ĐỂ LẤY HẾT EMAIL TỪ CÁC TRANG)
  $('#btn-activate-emergency')
    .off('click')
    .on('click', function () {
      const selectedEmails = [];
      const table = $('#memberListTable').DataTable();

      // Dùng API của DataTable để quét toàn bộ checkbox được tick
      table.$('input.member-checkbox:checked').each(function () {
        selectedEmails.push($(this).val());
      });

      if (selectedEmails.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 thành viên!', 'warning');
        return;
      }

      // ... (Phần code hiển thị modal phía sau giữ nguyên) ...
      document.getElementById('incidentLocation').value = '';
      document.getElementById('incidentDetails').value = '';

      const now = new Date();
      const timeString = now.toLocaleString('vi-VN', { hour12: false });
      document.getElementById('activationTime').value = timeString;

      window.tempSelectedEmails = selectedEmails;
      $('#emergencyDetailsModal').modal('show');
    });
  // Event listener for the "Next" button in the details modal
  // Sự kiện nút "Next" (Chuyển sang màn hình Review)
  // ======================================================
  // XỬ LÝ QUY TRÌNH KÍCH HOẠT KHẨN CẤP (NEW & ADD)
  // ======================================================

  // 2. Helper: Kiểm tra nhân sự có đang bận không (để cảnh báo)
  function getBusyInfo(username) {
    if (!window.appState.deploymentHistory) return null;

    // Tìm lịch sử gần nhất
    const lastDeploy = window.appState.deploymentHistory.find(
      (h) => String(h.username).toLowerCase() === String(username).toLowerCase()
    );

    if (!lastDeploy) return null;

    // Nếu đang Active/Mobilize/Deploy/Replace_In VÀ Sự kiện chưa đóng
    if (
      ['mobilize', 'deployed', 'replace_in', 'active'].includes(
        lastDeploy.action
      )
    ) {
      const incInfo = window.appState.trackingIncidents.find(
        (i) => i.id === lastDeploy.incidentId
      );
      if (incInfo && incInfo.status !== 'closed') {
        return {
          incidentId: lastDeploy.incidentId,
          eventName: incInfo.event || lastDeploy.incidentId,
        };
      }
    }
    return null;
  }

  // 3. Xử lý nút "Tiếp tục" -> Chuyển sang Modal Review
  // ========================================================================
  // 1. HÀM QUẢN LÝ GIAO DIỆN (TỰ ĐỘNG FETCH DB NẾU BỘ NHỚ TRỐNG)
  // ========================================================================
  window.toggleActivationType = async function () {
    const typeElement = document.querySelector(
      'input[name="activationType"]:checked'
    );
    if (!typeElement) return;
    const type = typeElement.value;

    const groupNew = document.getElementById('group-new-incident');
    const groupAdd = document.getElementById('group-existing-incident');
    const select = document.getElementById('existingIncidentSelect');

    // Tìm hoặc tạo khung hiển thị thông tin thay thế nhân sự
    let replacementInfo = document.getElementById('replacement-info');
    if (!replacementInfo) {
      replacementInfo = document.createElement('div');
      replacementInfo.id = 'replacement-info';
      groupAdd.appendChild(replacementInfo);
    }

    if (type === 'new') {
      groupNew.style.display = 'block';
      groupAdd.style.display = 'none';
      replacementInfo.style.display = 'none';
    } else {
      groupNew.style.display = 'none';
      groupAdd.style.display = 'block';

      // BƯỚC 1: Hiển thị trạng thái đang tải
      select.innerHTML =
        '<option value="">-- Đang tải dữ liệu từ máy chủ... --</option>';
      select.disabled = true;

      try {
        let activeIncidents = [];

        // BƯỚC 2: Kiểm tra bộ nhớ đệm, nếu rỗng thì gọi thẳng xuống Database
        if (
          window.appState &&
          window.appState.trackingIncidents &&
          window.appState.trackingIncidents.length > 0
        ) {
          activeIncidents = window.appState.trackingIncidents.filter(
            (inc) => inc.status !== 'closed'
          );
        } else {
          console.log('Bộ nhớ đệm rỗng, đang fetch trực tiếp từ DB...');
          const { data, error } = await window.supabaseClient
            .from('incidents')
            .select('*')
            .neq('status', 'closed'); // Lấy tất cả sự kiện chưa đóng

          if (!error && data) {
            activeIncidents = data;
            // Lưu lại vào bộ nhớ đệm cho lần sau
            if (!window.appState) window.appState = {};
            window.appState.trackingIncidents = data;
          }
        }

        // BƯỚC 3: Đổ dữ liệu vào Dropdown
        select.innerHTML =
          '<option value="">-- Chọn sự kiện cần bổ sung/thay thế --</option>';
        select.disabled = false; // Mở khóa Dropdown

        if (activeIncidents.length === 0) {
          select.innerHTML +=
            '<option value="" disabled>(Không có sự kiện nào đang hoạt động)</option>';
        } else {
          activeIncidents.forEach((inc) => {
            const eventName =
              inc.event_name || inc.event || 'Sự kiện không tên';
            const location =
              inc.location_text || inc.location || 'Chưa rõ địa điểm';
            const declined = inc.declined_members || '';
            const isActivated = !!inc.admin_activate;
            const statusIcon = isActivated ? '🔴' : '⚠️';

            select.innerHTML += `<option value="${
              inc.id
            }" data-declined="${declined}">
            ${statusIcon} [ID: ${String(inc.id).substring(
              0,
              5
            )}] ${eventName} (${location})
          </option>`;
          });
        }

        // BƯỚC 4: Xử lý sự kiện khi chọn 1 option
        select.onchange = function () {
          const selectedOption = select.options[select.selectedIndex];
          if (!selectedOption || !selectedOption.value) {
            replacementInfo.style.display = 'none';
            return;
          }

          const declinedStr = selectedOption.getAttribute('data-declined');
          replacementInfo.style.display = 'block';

          if (declinedStr) {
            const declinedArr = declinedStr.split(';').filter(Boolean);
            replacementInfo.innerHTML = `
            <div class="alert alert-danger mt-3 d-flex align-items-center" role="alert">
              <i class='bx bxs-error-circle fs-4 me-2'></i>
              <div>
                <strong>Cần bổ sung thay thế ${
                  declinedArr.length
                } nhân sự đã từ chối:</strong><br/>
                <small>${declinedArr.join(', ')}</small>
              </div>
            </div>
          `;
          } else {
            replacementInfo.innerHTML = `
            <div class="alert alert-info mt-3 d-flex align-items-center" role="alert">
              <i class='bx bxs-info-circle fs-4 me-2'></i>
              <div>
                <strong>Sự kiện đang diễn ra ổn định.</strong><br/>
                <small>Hiện chưa có nhân sự nào từ chối. Lệnh này sẽ tăng cường thêm quân số.</small>
              </div>
            </div>
          `;
          }
        };
      } catch (err) {
        console.error('Lỗi tải sự kiện:', err);
        select.innerHTML =
          '<option value="">-- Lỗi tải dữ liệu, vui lòng thử lại --</option>';
        select.disabled = false;
      }
    }
  };

  // ========================================================================
  // 2. SỰ KIỆN CLICK NÚT "TIẾP TỤC" ĐỂ REVIEW VÀ KIỂM TRA LỊCH TRỰC
  // ========================================================================
  document
    .getElementById('nextToReviewBtn')
    .addEventListener('click', async function () {
      this.blur(); // Xóa focus khỏi nút bấm

      // A. Lấy thông tin từ form
      const typeElement = document.querySelector(
        'input[name="activationType"]:checked'
      );
      if (!typeElement) {
        showToast(
          'Vui lòng chọn loại kích hoạt (Tạo mới / Bổ sung)!',
          'warning'
        );
        return;
      }

      const type = typeElement.value;
      const time = $('#activationTime').val();

      let location = '',
        details = '',
        incidentId = '',
        lat = '',
        lng = '',
        ward = '';

      // Xử lý nhánh Tạo Mới vs Bổ Sung
      if (type === 'new') {
        location = $('#incidentLocation').val();
        details = $('#incidentDetails').val();
        lat = $('#incidentLat').val();
        lng = $('#incidentLng').val();
        ward = $('#incidentWard').val();

        if (!location) {
          showToast('Vui lòng nhập địa điểm!', 'warning');
          return;
        }
        if (!details) {
          showToast('Vui lòng nhập chi tiết sự kiện!', 'warning');
          return;
        }
      } else {
        incidentId = $('#existingIncidentSelect').val();
        if (!incidentId) {
          showToast('Vui lòng chọn sự kiện để bổ sung/thay thế!', 'warning');
          return;
        }

        // Quét mảng trackingIncidents để lấy dữ liệu sự kiện cũ
        const incidents =
          window.appState?.trackingIncidents ||
          window.appState?.incidents ||
          [];
        const inc = incidents.find((i) => String(i.id) === String(incidentId));

        if (inc) {
          const eventName = inc.event_name || inc.event || 'Sự kiện';
          location =
            inc.location_text || inc.location || 'Chưa xác định địa điểm';

          // Khôi phục lại tọa độ của sự kiện cũ
          lat = inc.latitude || '';
          lng = inc.longitude || '';
          ward = inc.ma_xa || '';

          // Tự động phân tích xem đây là lệnh Thay Thế hay Tăng Cường
          const declinedCount = inc.declined_members
            ? inc.declined_members.split(';').filter(Boolean).length
            : 0;

          if (declinedCount > 0) {
            details = `[THAY THẾ NHÂN SỰ] Điều động bổ sung thay thế cho ${declinedCount} chuyên viên đã từ chối tham gia sự kiện: ${eventName}`;
          } else {
            details = `[TĂNG CƯỜNG QUÂN SỐ] Điều động bổ sung thêm lực lượng cho sự kiện: ${eventName}`;
          }
        } else {
          showToast(
            'Không tìm thấy dữ liệu của sự kiện này. Vui lòng tải lại trang!',
            'error'
          );
          return;
        }
      }

      // B. Chuẩn bị danh sách Email cần check
      const emailsToCheck = window.tempSelectedEmails || [];
      if (emailsToCheck.length === 0) {
        showToast('Chưa chọn thành viên nào!', 'warning');
        return;
      }

      showLoadingSpinner();

      try {
        // C. TRUY VẤN TRỰC TIẾP PROFILES TỪ DATABASE
        const { data: freshProfiles, error: profErr } =
          await window.supabaseClient
            .from('profiles')
            .select('id, email, full_name, position, team')
            .in('email', emailsToCheck);

        if (profErr) throw profErr;

        const dbUsers = freshProfiles || [];
        const userIdsToCheck = dbUsers.map((u) => u.id);
        let busyList = [];

        // D. KIỂM TRA LỊCH TRỰC
        if (userIdsToCheck.length > 0) {
          const { data: busyData, error } = await window.supabaseClient
            .from('roster_assignments')
            .select(
              'user_id, assignment_status, roster_schedules(duty_date, team_name)'
            )
            .in('user_id', userIdsToCheck)
            .in('assignment_status', ['assigned', 'confirmed'])
            .gte(
              'roster_schedules.duty_date',
              new Date().toISOString().split('T')[0]
            );

          if (error) throw error;

          const todayStr = new Date().toISOString().split('T')[0];
          busyList = (busyData || []).filter(
            (b) =>
              b.roster_schedules && b.roster_schedules.duty_date === todayStr
          );
        }

        // E. HIỂN THỊ LÊN GIAO DIỆN REVIEW
        $('#reviewTime').text(time);
        $('#reviewLocation').text(location);
        $('#reviewDetails').text(details);
        $('#reviewMemberCount').text(emailsToCheck.length);

        const listContainer = $('#reviewMemberList');
        listContainer.empty();
        let busyCount = 0;

        emailsToCheck.forEach((email) => {
          let displayName = email;
          let teamBadge = '';
          let positionBadge = '';
          let userUUID = null;

          const m = dbUsers.find(
            (u) => String(u.email).toLowerCase() === String(email).toLowerCase()
          );

          if (m) {
            displayName =
              m.full_name && m.full_name.trim() !== ''
                ? m.full_name
                : m.username || email;
            userUUID = m.id;
            if (m.team && m.team !== 'No team') {
              teamBadge = `<span class="badge bg-light text-dark border ms-2 team-badge">${window.escapeHtml(
                m.team
              )}</span>`;
            }
            if (m.position && m.position.trim() !== '') {
              positionBadge = `<span class="badge bg-info text-dark border ms-1 position-badge">${window.escapeHtml(
                m.position
              )}</span>`;
            }
          }

          const isBusy = busyList.find((b) => b.user_id === userUUID);
          let statusHtml =
            '<i class="bx bx-check-circle text-success" style="font-size: 1.5rem;"></i>';
          let rowClass = '';

          if (isBusy) {
            busyCount++;
            statusHtml = `<span class="badge bg-danger busy-warning"><i class='bx bxs-error-alt me-1'></i> Bận trực: ${isBusy.roster_schedules.team_name}</span>`;
            rowClass = 'bg-warning-subtle list-group-item-warning';
          }

          let displayEmailHtml = '';
          if (displayName.toLowerCase() !== email.toLowerCase()) {
            displayEmailHtml = `<small class="text-muted member-email">${window.escapeHtml(
              email
            )}</small>`;
          }

          listContainer.append(`
        <li class="list-group-item d-flex justify-content-between align-items-center ${rowClass}">
            <div class="ms-2 me-auto">
                <div class="fw-bold">${window.escapeHtml(
                  displayName
                )} ${teamBadge} ${positionBadge}</div>
                ${displayEmailHtml}
            </div>
            ${statusHtml}
        </li>
      `);
        });

        // F. LƯU DỮ LIỆU ĐỂ TIẾN HÀNH KÍCH HOẠT
        window.tempActivationData = {
          type: type,
          incidentId: incidentId,
          time: time,
          location: location,
          details: details,
          members: emailsToCheck,
          latitude: lat,
          longitude: lng,
          ma_xa: ward,
        };

        if (busyCount > 0) {
          showToast(
            `⚠️ Cảnh báo: Có ${busyCount} nhân sự đang vướng lịch trực!`,
            'warning'
          );
        }

        // 1. Ra lệnh đóng Modal hiện tại
        $('#emergencyDetailsModal').modal('hide');

        // 2. Lắng nghe: KHI NÀO đóng hẳn xong (hiệu ứng chạy xong), THÌ mới mở Modal Review
        $('#emergencyDetailsModal').one('hidden.bs.modal', function () {
          $('#finalReviewModal').modal('show');
        });
      } catch (err) {
        showToast('Lỗi hệ thống: ' + err.message, 'error');
        console.error('Lỗi khi review:', err);
      } finally {
        hideLoadingSpinner();
      }
    });

  // ============================================================
  // 4. Sự kiện nút "Back" trong modal review (ĐÃ FIX CẢNH BÁO MÀU VÀNG)
  // ============================================================
  document
    .getElementById('backToDetailsBtn')
    .addEventListener('click', function () {
      // Xóa điểm nhìn (focus) khỏi nút bấm trước khi đóng Modal
      this.blur();

      // Đóng modal hiện tại và mở lại modal trước đó
      $('#finalReviewModal').modal('hide');
      $('#emergencyDetailsModal').modal('show');
    });

  // ============================================================
  // 5. Sự kiện nút "Confirm and Send" (ĐÃ ĐỒNG BỘ ĐỦ VỆ TINH + TRIGGER)
  // ============================================================
  document
    .getElementById('confirmAndSendBtn')
    .addEventListener('click', async function () {
      this.blur(); // Tắt focus nút
      $('#finalReviewModal').modal('hide');
      if (typeof window.closeModal === 'function')
        window.closeModal('finalReviewModal');
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      const data = window.tempActivationData; // Dữ liệu từ Modal review
      const supabase = window.supabaseClient;

      try {
        // 1. LẤY UUID CỦA ADMIN ĐANG KÍCH HOẠT VÀ TOÀN BỘ MEMBERS TỪ DATABASE
        let currentAdminId = null;
        const currentEmail =
          window.userSession?.email || window.userSession?.username || '';

        if (currentEmail) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', currentEmail)
            .single();
          if (profile) currentAdminId = profile.id;
        }

        // TRUY VẤN TRỰC TIẾP UUID CỦA THÀNH VIÊN TỪ BẢNG PROFILES (Sửa lỗi mất dữ liệu do appState rỗng)
        let memberProfiles = [];
        if (data.members && data.members.length > 0) {
          const { data: profiles, error: profErr } = await supabase
            .from('profiles')
            .select('id, email')
            .in('email', data.members); // Quét danh sách email gửi lên

          if (profErr) throw profErr;
          memberProfiles = profiles || [];
        }

        const getUuidFromFetchedProfiles = (email) => {
          const match = memberProfiles.find(
            (p) => String(p.email).toLowerCase() === String(email).toLowerCase()
          );
          return match ? match.id : null;
        };

        const membersString = data.members.join(';');
        let activeIncidentId = data.incidentId;

        // ----------------------------------------------------
        // 2. TIẾN HÀNH GHI DỮ LIỆU
        // ----------------------------------------------------
        if (data.type === 'new') {
          // A. Tạo bảng chính (incidents)
          const newIncident = {
            event_name: data.details,
            location_text: data.location,
            ma_xa: data.ma_xa || null,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            status: 'active',
            activation_time: new Date().toISOString(),
            initial_selected_members: membersString,
            admin_activate: currentAdminId,
          };

          const { data: inserted, error: incErr } = await supabase
            .from('incidents')
            .insert([newIncident])
            .select();
          if (incErr) throw incErr;
          activeIncidentId = inserted[0].id;

          // 🌟 CÁC BẢNG: assessments, plans, objectives, activities, reports ĐÃ ĐƯỢC SQL TRIGGER TỰ ĐỘNG TẠO 🌟

          // B. Tạo lịch sử điều động (deployment_history) sử dụng dữ liệu vừa quét từ DB
          const deployments = data.members
            .map((email) => {
              const uId = getUuidFromFetchedProfiles(email);
              return {
                incident_id: activeIncidentId,
                user_id: uId,
                action_type: 'deployed',
                reason: 'Điều động khẩn cấp ban đầu',
              };
            })
            .filter((d) => d.user_id); // Chỉ giữ lại các bản ghi tìm thấy UUID hợp lệ

          if (deployments.length > 0) {
            const { error: deployErr } = await supabase
              .from('deployment_history')
              .insert(deployments);
            if (deployErr)
              console.error('Lỗi ghi deployment_history:', deployErr);
          }
        } else if (data.type === 'add') {
          // Logic bổ sung nhân sự vào sự kiện cũ
          const { data: oldInc, error: fetchErr } = await supabase
            .from('incidents')
            .select('initial_selected_members')
            .eq('id', activeIncidentId)
            .single();
          if (fetchErr) throw fetchErr;

          const oldMembers = oldInc.initial_selected_members
            ? oldInc.initial_selected_members.split(';')
            : [];
          const combinedMembers = [...new Set([...oldMembers, ...data.members])]
            .filter(Boolean)
            .join(';');

          await supabase
            .from('incidents')
            .update({ initial_selected_members: combinedMembers })
            .eq('id', activeIncidentId);

          // Ghi nhận điều động bổ sung
          const newDeployments = data.members
            .map((email) => ({
              incident_id: activeIncidentId,
              user_id: getUuidFromFetchedProfiles(email),
              action_type: 'deployed',
              reason: 'Điều động bổ sung vào đội RRT',
            }))
            .filter((d) => d.user_id && !oldMembers.includes(email));

          if (newDeployments.length > 0) {
            await supabase.from('deployment_history').insert(newDeployments);
          }
        }

        // ----------------------------------------------------
        // 3. THÔNG BÁO GIAO DIỆN VÀ PHÁT LỆNH RRT
        // ----------------------------------------------------
        if (typeof showToast === 'function')
          showToast('🚨 Kích hoạt thành công!', 'success');

        if (
          data.members &&
          data.members.length > 0 &&
          typeof window.createSystemNotification === 'function'
        ) {
          const notifMsg = `THÔNG BÁO: ${
            data.type === 'new' ? 'Sự kiện' : 'Bổ sung nhân lực'
          }: ${data.details}`;

          // ---> CẬP NHẬT Ở ĐÂY: Truyền đúng type 'khan_cap' và activeIncidentId
          await window.createSystemNotification(
            data.members,
            notifMsg,
            'khan_cap', // type: 'khan_cap' thay vì 'incident'
            activeIncidentId, // incidentId
            null // scheduleId
          );
        }

        if (typeof showActivationSuccessModal === 'function') {
          const allUsers =
            window.appState.users || window.appState.teamData || [];
          const userNamesToNotify = data.members.map((email) => {
            const u = allUsers.find(
              (x) =>
                String(x.email).toLowerCase() === String(email).toLowerCase()
            );
            return u ? u.full_name || u.email : email;
          });
          showActivationSuccessModal({
            incidentId: activeIncidentId,
            recipientCount: data.members.length,
            recipients: userNamesToNotify,
          });
        }
      } catch (err) {
        console.error('Lỗi quy trình kích hoạt:', err);
        if (typeof showToast === 'function')
          showToast('Lỗi hệ thống: ' + (err.message || ''), 'error');
        $('#finalReviewModal').modal('show');
      } finally {
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
      }
    });

  /**
   * Xử lý sau khi kích hoạt khẩn cấp thành công
   * Hàm này tự động chạy KHI NGƯỜI DÙNG BẤM ĐÓNG MODAL CHÚC MỪNG.
   */
  window.onEmergencyActivatedSuccess = async function () {
    // Xóa form cũ để lần sau mở lên sạch sẽ
    $('.member-checkbox').prop('checked', false);
    $('#selectAllMembers').prop('checked', false);
    if (typeof updateSelectedCount === 'function') updateSelectedCount();
    $('#incidentLocation').val('');
    $('#incidentDetails').val('');

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // Làm mới dữ liệu hệ thống ngầm bên dưới
      if (typeof window.reloadData === 'function') {
        await window.reloadData({ showSpinner: false, refreshUI: false });
      }

      // Cập nhật lại giao diện Dashboard
      if (typeof window.enterDashboard === 'function') {
        await window.enterDashboard();
      }
    } catch (err) {
      console.error('Lỗi khi làm mới bảng điều khiển:', err);
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }

    // Tự động điều hướng về trang chủ Dashboard
    if (typeof window.simulateSidebarClick === 'function') {
      window.simulateSidebarClick('page-dashboard');
    }
  };
  /**
   * Displays a detailed modal with confirmation information.
   * @param {object} data The data object containing incident details.
   */
  /**
   * 1. Displays a detailed modal with confirmation information.
   * Đã nâng cấp thành window. để gọi được từ mọi nơi.
   */
  window.showActivationSuccessModal = function (data) {
    const modalTitle = document.getElementById('activationSuccessModalLabel');
    const incidentIdSpan = document.getElementById('incidentId');
    const recipientCountSpan = document.getElementById('recipientCount');
    const recipientListUl = document.getElementById('recipientList');

    if (modalTitle) modalTitle.textContent = 'KÍCH HOẠT THÀNH CÔNG!';
    if (incidentIdSpan) incidentIdSpan.textContent = data.incidentId || 'N/A';
    if (recipientCountSpan)
      recipientCountSpan.textContent = data.recipientCount || 0;

    if (recipientListUl) {
      recipientListUl.innerHTML = '';
      if (data.recipients && data.recipients.length > 0) {
        data.recipients.forEach((name) => {
          const li = document.createElement('li');
          li.className =
            'list-group-item fw-bold text-danger border-0 border-bottom'; // Format cho ngầu
          li.innerHTML = `<i class='bx bx-radio-circle-marked'></i> ${window.escapeHtml(
            name
          )}`;
          recipientListUl.appendChild(li);
        });
      } else {
        recipientListUl.innerHTML =
          '<li class="list-group-item text-muted border-0">Không tìm thấy thông tin người nhận.</li>';
      }
    }

    const modalEl = $('#activationSuccessModal');

    // Gỡ bỏ sự kiện cũ để tránh lặp lệnh
    modalEl.off('hidden.bs.modal');

    // GÀI CÒ: Khi người dùng ĐÓNG modal chúc mừng, lập tức chạy quy trình Dọn dẹp & Chuyển trang
    modalEl.on('hidden.bs.modal', function () {
      if (typeof window.onEmergencyActivatedSuccess === 'function') {
        window.onEmergencyActivatedSuccess();
      }
    });

    // Hiện modal
    modalEl.modal('show');
  };

  /**
   * 3. Shows a custom confirmation modal.
   * Giữ nguyên cấu trúc của bạn, chỉ chuyển thành window. để an toàn.
   */
  window.showCustomConfirmModal = function (message, onConfirmCallback) {
    const modal = $('#customConfirmModal');
    const confirmMessage = $('#confirmMessage');
    const btnOk = $('#btnOkConfirm');
    const btnCancel = $('#btnCancelConfirm');

    confirmMessage.text(message);

    btnOk.off('click');
    btnCancel.off('click');

    btnOk.on('click', function () {
      modal.modal('hide');
      if (onConfirmCallback && typeof onConfirmCallback === 'function') {
        onConfirmCallback();
      }
    });

    btnCancel.on('click', function () {
      modal.modal('hide');
    });

    modal.modal('show');
  };
  // Callback function sau khi kích hoạt thành công

  // Generic failure handler
  function onFailure(error) {
    hideLoadingSpinner();
    showToast('Đã xảy ra lỗi: ' + (error.message || error), 'error');
  }

  //CALENDAR

  // Chuyển đổi trạng thái sang tiếng Việt cho dễ đọc
  function formatStatus(status) {
    switch (status) {
      case 'Active':
        return 'Đang hoạt động';
      case 'Confirmed':
        return 'Đã xác nhận';
      case 'Rejected':
        return 'Đã từ chối';
      default:
        return status;
    }
  }
  // ============================================================
  // LOGIC LẬP BÁO CÁO (SITREP) - XUẤT PDF TRÌNH DUYỆT
  // ============================================================

  $(document).on('click', '#btn-export-pdf', async function () {
    if (!window.currentDossierId) {
      showToast('Không tìm thấy ID ổ dịch.', 'error');
      return;
    }

    const $btn = $(this);
    const originalText = $btn.html();
    $btn
      .prop('disabled', true)
      .html('<i class="bx bx-loader-alt bx-spin"></i> Đang chuẩn bị...');

    showToast('Đang chuẩn bị giao diện in báo cáo SITREP...', 'info');

    try {
      // Tùy chọn: Lấy dữ liệu chi tiết của Dossier nếu cần truyền vào trang in riêng
      // const { data, error } = await supabaseClient.from('incidents').select('*').eq('id', window.currentDossierId).single();
      // if (error) throw error;

      // Mở hộp thoại in của trình duyệt (Ctrl+P)
      // Trình duyệt sẽ tự lo việc chuyển CSS thành dạng in (bạn có thể thiết lập @media print trong file CSS)
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err) {
      console.error('Lỗi in SITREP:', err);
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        $btn.prop('disabled', false).html(originalText);
      }, 1000);
    }
  });
  //TRAINING
  // ============================================================
  // MODULE TRAINING LOGIC – ĐÃ FIX HOÀN TOÀN (XÓA + LƯU + TÌM KIẾM)
  // Helper: Parse ngày an toàn (Hỗ trợ dd/MM/yyyy và yyyy-MM-dd)
  function parseDateStr(dateStr) {
    if (!dateStr) return null;

    // 🔥 CẬP NHẬT: Thay thế 'T' bằng khoảng trắng để cắt bỏ phần giờ an toàn hơn
    let str = String(dateStr).replace('T', ' ').trim().split(' ')[0];
    let day, month, year;

    // Trường hợp 1: dd/MM/yyyy (Từ Datepicker VN)
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
    }
    // Trường hợp 2: yyyy-MM-dd (Từ Server/ISO)
    else if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    }

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const d = new Date(year, month, day);
      // Đặt giờ về 00:00:00 để so sánh chính xác chỉ theo ngày
      d.setHours(0, 0, 0, 0);

      if (
        d.getDate() === day &&
        d.getMonth() === month &&
        d.getFullYear() === year
      ) {
        return d;
      }
    }
    return null;
  }
  // ============================================================
  // 1. HÀM RENDER TRANG TRAINING (HOÀN CHỈNH)
  // ============================================================
  window.renderTrainingPage = async function () {
    const container = document.getElementById('course-grid-container');
    if (!container) return;

    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      // 1. Tải dữ liệu trực tiếp từ 2 bảng (Sửa lỗi "trắng bóc")
      const [coursesRes, recordsRes] = await Promise.all([
        supabaseClient.from('training_courses').select('*'),
        supabaseClient.from('training_records').select('*'),
      ]);

      if (coursesRes.error) throw coursesRes.error;

      // 2. Map dữ liệu Supabase về định dạng giao diện cần
      const courses = (coursesRes.data || []).map((item) => ({
        id: item.id,
        name: item.course_name, // Map từ course_name
        date: item.training_date
          ? new Date(item.training_date).toLocaleDateString('vi-VN')
          : 'Chưa rõ',
        rawDate: new Date(item.training_date), // Để so sánh today
        location: item.location,
      }));

      const records = (recordsRes.data || []).map((r) => ({
        ...r,
        courseId: r.course_id, // Map từ course_id trong DB
      }));

      // --- PHÂN QUYỀN ADMIN ---
      const isAdmin =
        (window.userSession?.role || '').toLowerCase() === 'admin';
      const btnCreate = document.getElementById('btn-create-course-trigger');
      if (btnCreate) btnCreate.style.display = isAdmin ? 'block' : 'none';

      // 3. Reset container
      container.innerHTML = '';
      if (courses.length === 0) {
        container.innerHTML =
          '<p class="text-muted text-center mt-4">Chưa có khóa đào tạo nào.</p>';
        if (typeof loadTrainingData === 'function') loadTrainingData();
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 4. Vẽ từng thẻ khóa học
      courses.forEach((c) => {
        const recordsThisCourse = records.filter(
          (r) => String(r.courseId) === String(c.id)
        );
        const hasGraded = recordsThisCourse.some(
          (r) => r.result === 'pass' || r.result === 'fail'
        );
        const totalTrainees = recordsThisCourse.length;

        let statusText = 'Upcoming';
        let badgeClass = 'bg-primary';
        let cardClass = 'course-card cc-gen';
        let cardStyle = '';

        if (hasGraded) {
          statusText = 'Graded';
          badgeClass = 'bg-success';
          cardClass = 'course-card cc-spec';
        } else if (c.rawDate) {
          if (c.rawDate < today) {
            statusText = 'Completed';
            badgeClass = 'bg-secondary';
            cardStyle = 'border-top: 5px solid #6c757d;';
          } else if (c.rawDate.getTime() === today.getTime()) {
            statusText = 'Happening';
            badgeClass = 'bg-danger spinner-grow spinner-grow-sm';
            cardStyle = 'border-top: 5px solid #dc3545;';
          }
        }

        const deleteBtn = isAdmin
          ? `
                <button class="btn-delete-course" 
                        onclick="event.stopPropagation(); deleteCourseConfirm('${
                          c.id
                        }', '${escapeHtml(c.name)}', event)" 
                        title="Xóa khóa học"
                        style="position: absolute; bottom: 15px; right: 15px; width: 30px; height: 30px; background: #ffebee; color: #d32f2f; border: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">
                    <i class='bx bx-trash'></i>
                </button>`
          : '';

        const html = `
            <div class="${cardClass}" style="${cardStyle}" data-course-id="${
          c.id
        }" data-name="${escapeHtml(c.name).toLowerCase()}">
                <span class="course-badge badge ${badgeClass}" style="position: absolute; top: 15px; right: 15px; padding: 5px 10px; border-radius: 12px; font-size: 11px; color: white;">
                    ${statusText}
                </span>
                ${deleteBtn}
                <div onclick="openTrainingDossier('${
                  c.id
                }')" style="cursor: pointer;">
                    <h5 style="margin: 0 0 10px 0; font-weight: bold; color: #333; font-size: 16px;">${escapeHtml(
                      c.name
                    )}</h5>
                    <div style="font-size: 13px; color: #666; line-height: 1.5;">
                        <i class="fa-solid fa-location-dot"></i> ${escapeHtml(
                          c.location || 'Chưa xác định'
                        )}<br>
                        <i class="fa-regular fa-calendar"></i> ${c.date}
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px;">
                        <small class="text-muted">ID: ${c.id.substring(
                          0,
                          8
                        )}...</small>
                        <small><strong>${totalTrainees}</strong> học viên</small>
                    </div>
                </div>
            </div>`;

        container.insertAdjacentHTML('beforeend', html);
      });

      // 5. Tìm kiếm
      const searchInput = document.getElementById('training-search');
      if (searchInput) {
        searchInput.onkeyup = window.filterTrainingCourses;
      }

      // 6. Vẽ biểu đồ
      await window.loadTrainingData();
      if (typeof renderTrainingAnalytics === 'function')
        renderTrainingAnalytics();
    } catch (err) {
      console.error('Lỗi renderTrainingPage:', err);
      container.innerHTML = `<p class="text-danger text-center mt-4">Có lỗi xảy ra khi tải dữ liệu: ${err.message}</p>`;
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // 2. TÌM KIẾM KHÓA HỌC (ĐÃ SỬA LỖI KHÔNG TÌM ĐƯỢC)
  window.filterTrainingCourses = function () {
    const input = document.getElementById('training-search');
    if (!input) return;
    const filter = input.value.toLowerCase().trim();
    const cards = document.querySelectorAll(
      '#course-grid-container .course-card'
    );

    cards.forEach((card) => {
      const name = card.getAttribute('data-name') || '';
      card.style.display = name.includes(filter) ? '' : 'none';
    });
  };

  // 3. XÁC NHẬN XÓA KHÓA HỌC (SUPABASE)
  window.deleteCourseConfirm = function (courseId, courseName, event) {
    if (event) event.stopPropagation();

    showToastConfirm(
      `Bạn có chắc chắn muốn xóa khóa học <strong>${courseName}</strong>?`,
      async function () {
        // ✅ Show spinner đúng cách
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

        try {
          const { error } = await supabaseClient
            .from('training_courses')
            .delete()
            .eq('id', courseId);

          if (error) throw error;

          showToast('Đã xóa khóa học thành công!', 'success');

          // Refresh UI
          await window.loadTrainingData();
          if (typeof renderTrainingAnalytics === 'function')
            renderTrainingAnalytics();
          await window.renderTrainingPage();
        } catch (err) {
          console.error('Lỗi xóa khóa học:', err);
          showToast('Lỗi: ' + err.message, 'error');
        } finally {
          // ✅ Hide spinner đúng cách
          if (typeof hideLoadingSpinner === 'function') {
            hideLoadingSpinner();
          } else if (typeof showLoadingSpinner === 'function') {
            showLoadingSpinner(false);
          }
        }
      }
    );
  };

  // 3. Mở chi tiết khóa học (Dossier) - CÓ PHÂN QUYỀN
  window.loadTrainingData = async function () {
    try {
      const [coursesRes, recordsRes] = await Promise.all([
        supabaseClient.from('training_courses').select('*'),
        supabaseClient.from('training_records').select('*'),
      ]);

      // Fetch profiles để lấy tên, email VÀ TEAM
      const userIds = [
        ...new Set(
          (recordsRes.data || [])
            .map((r) => r.profile_id || r.user_id)
            .filter(Boolean)
        ),
      ];

      let profilesMap = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select('id, full_name, email, team,position,phone') // ✅ Lấy thêm team
          .in('id', userIds);

        (profiles || []).forEach((p) => {
          profilesMap[p.id] = {
            fullName: p.full_name || 'N/A',
            email: p.email || '',
            team: p.team || 'N/A', // ✅ Lưu team
            postion: p.position || 'N/A', // ✅ Lưu team
            phone: p.phone || '', // ✅ Lưu team
          };
        });
      }

      window.appState = window.appState || {};
      window.appState.training = {
        courses: coursesRes.data || [],
        records: (recordsRes.data || []).map((r) => {
          const profileData = profilesMap[r.profile_id || r.user_id] || {};
          return {
            ...r,
            fullName: profileData.fullName || 'Chưa cập nhật',
            email: profileData.email || '',
            team: profileData.team || '', // ✅ Thêm team vào record
            phone: profileData.phone || '', // ✅ Thêm team vào record
            position: profileData.postion || '', // ✅ Thêm team vào record
          };
        }),
        profilesMap: profilesMap, // ✅ Lưu map để dùng cho biểu đồ
      };

      console.log('✅ Training data loaded:', window.appState.training);
    } catch (err) {
      console.error('Lỗi loadTrainingData:', err);
    }
  };

  // ========================================================================
  // OPEN TRAINING DOSSIER - FIX HIỂN THỊ TÊN HỌC VIÊN
  // ========================================================================
  window.openTrainingDossier = async function (courseId) {
    // Đảm bảo data đã load
    if (!window.appState?.training?.courses) {
      await window.loadTrainingData();
    }

    const course = window.appState.training.courses.find(
      (c) => String(c.id) === String(courseId)
    );
    if (!course) {
      showToast('Không tìm thấy khóa học!', 'error');
      return;
    }

    window.currentCourseId = courseId;

    // UI Switch
    document.getElementById('training-list-view').style.display = 'none';
    document.getElementById('training-dossier-view').classList.add('active');

    // Điền thông tin khóa học
    document.getElementById('td-title').textContent =
      course.course_name || course.name || 'Không tên';
    document.getElementById('td-date').textContent = course.training_date
      ? new Date(course.training_date).toLocaleDateString('vi-VN')
      : 'Chưa rõ';
    document.getElementById('td-loc').textContent =
      course.location || 'Chưa xác định';
    document.getElementById('td-desc').textContent =
      course.description || course.desc || '';

    // Render danh sách học viên - FIX: dùng profile_id hoặc user_id
    const records = window.appState.training.records.filter(
      (r) => String(r.course_id) === String(courseId)
    );

    const tbody = document.getElementById('trainee-list-body');
    tbody.innerHTML = '';

    if (records.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center">Chưa có học viên.</td></tr>';
    } else {
      records.forEach((r) => {
        // ✅ Lấy tên từ profile_id hoặc user_id
        const fullName = r.fullName || 'Chưa cập nhật';
        const userId = r.profile_id || r.user_id;
        const email = r.email;
        const phone = r.phone;
        const team = r.team;
        const position = r.position;
        const row = `
        <tr data-userid="${userId}">
          <td><b>${escapeHtml(fullName)}</b></td>
          <td>${escapeHtml(team)}</td>
          <td>${escapeHtml(position)}</td>
          <td>${escapeHtml(phone)}</td>
          <td>${escapeHtml(email)}</td>
          <td class="text-center">
            <input type="checkbox" class="chk-attendance" ${
              r.attendance ? 'checked' : ''
            }>
          </td>
          <td>
            <select class="form-select result-select st-${
              r.result || 'pending'
            }" onchange="this.className='form-select result-select st-'+this.value">
              <option value="pending" ${
                r.result === 'pending' ? 'selected' : ''
              }>Chờ</option>
              <option value="pass" ${
                r.result === 'pass' ? 'selected' : ''
              }>Đạt</option>
              <option value="fail" ${
                r.result === 'fail' ? 'selected' : ''
              }>Không đạt</option>
            </select>
          </td>
          <td><input type="text" class="note-input" value="${escapeHtml(
            r.note || ''
          )}"></td>
        </tr>`;
        tbody.insertAdjacentHTML('beforeend', row);
      });
    }
  };
  // TỰ ĐỘNG ĐỔI MÀU SELECT KHI MỞ LẠI TRANG HOẶC SAU KHI LƯU
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.result-select').forEach((select) => {
      const value = select.value;
      select.className = 'form-select result-select st-' + value;
    });
  });
  // 4. Đóng chi tiết
  window.closeTrainingDossier = function () {
    document.getElementById('training-dossier-view').classList.remove('active');
    document.getElementById('training-list-view').style.display = 'block';
  };

  // 5. Submit tạo khóa học (SUPABASE)
  window.submitCreateCourse = async function () {
    const name = document.getElementById('new-course-name').value;
    const date = document.getElementById('new-course-date').value;
    const loc = document.getElementById('new-course-loc').value;
    const desc = document.getElementById('new-course-desc')?.value || '';
    const file = document.getElementById('new-course-file')?.value || '';
    const teamFilter = document.getElementById('new-course-team-select').value;
    const roleFilter = document.getElementById('new-course-role-select').value;

    if (!name || !date) {
      showToast('Vui lòng nhập tên khóa học và ngày tổ chức.', 'warning');
      return;
    }

    // ✅ Đảm bảo appState.users đã load
    if (!window.appState?.users?.length) {
      await window.getInitialData?.(); // Hoặc fetch profiles riêng
    }

    // Lọc thành viên
    let membersToInsert = [];
    if (window.appState.users && Array.isArray(window.appState.users)) {
      membersToInsert = window.appState.users.filter((m) => {
        const memberTeam = String(m.team || '').trim();
        const memberPos = String(m.position || m.role || '').trim();
        const teamMatch = teamFilter === 'all' || memberTeam === teamFilter;
        const roleMatch = roleFilter === 'all' || memberPos === roleFilter;
        return teamMatch && roleMatch && m.id; // Chỉ lấy user có id
      });
    }

    const doCallServer = async () => {
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-create-course');
      } else {
        document.getElementById('modal-create-course').style.display = 'none';
      }

      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      try {
        // Bước 1: Tạo khóa học
        const { data: createdCourse, error: courseErr } = await supabaseClient
          .from('training_courses')
          .insert([
            {
              course_name: name,
              training_date: date,
              location: loc,
              description: desc,
              file_url: file,
              status: 'upcoming',
            },
          ])
          .select()
          .single();

        if (courseErr) throw courseErr;

        // Bước 2: Tạo training_records
        if (membersToInsert.length > 0 && createdCourse?.id) {
          const recordsData = membersToInsert.map((user) => ({
            course_id: createdCourse.id,
            user_id: user.id,
            profile_id: user.id, // ✅ Thêm profile_id nếu bảng có cột này
            attendance: false,
            result: 'pending',
            note: '',
          }));

          const { error: recordErr } = await supabaseClient
            .from('training_records')
            .insert(recordsData);

          if (recordErr) throw recordErr;
        }

        showToast(
          `Đã tạo khóa học với ${membersToInsert.length} học viên!`,
          'success'
        );

        // ✅ Refresh data và UI
        await window.loadTrainingData();
        if (typeof window.renderTrainingPage === 'function') {
          await window.renderTrainingPage();
        }
      } catch (err) {
        console.error('Lỗi tạo khóa học:', err);
        showToast('Lỗi: ' + err.message, 'error');
      } finally {
        if (typeof hideLoadingSpinner === 'function') {
          hideLoadingSpinner();
        } else if (typeof showLoadingSpinner === 'function') {
          showLoadingSpinner(false);
        }
      }
    };

    if (membersToInsert.length === 0) {
      showToastConfirm(
        '⚠️ Không tìm thấy thành viên nào. Tạo khóa học rỗng?',
        doCallServer
      );
    } else {
      doCallServer();
    }
  };
  // 6. Lưu kết quả học tập (SUPABASE)
  window.saveTrainingResultsClick = async function () {
    const rows = document.querySelectorAll('#trainee-list-body tr');
    const updatePromises = [];

    rows.forEach((row) => {
      const userId = row.getAttribute('data-userid'); // Đảm bảo HTML có data-userid="${r.user_id}"
      const attendance = row.querySelector('.chk-attendance').checked;
      const result = row.querySelector('.result-select').value;
      const note = row.querySelector('.note-input').value;

      if (userId) {
        updatePromises.push(
          supabaseClient
            .from('training_records')
            .update({ attendance, result, note })
            .eq('course_id', window.currentCourseId)
            .eq('user_id', userId)
        );
      }
    });

    showLoadingSpinner();
    try {
      await Promise.all(updatePromises);
      showToast('Lưu thành công!', 'success');

      // ✅ Refresh data và UI

      await window.loadTrainingData();
      await window.renderTrainingPage(); // Giả sử hàm này render lại list course
      if (window.currentCourseId)
        await window.openTrainingDossier(window.currentCourseId);
    } catch (err) {
      showToast('Lỗi lưu: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

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
    btn.style.borderBottomColor = '#007bff';
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
  // ============================================================
  // LOGIC ROSTER WIZARD (SMART REPLACEMENT - SUPABASE VERSION)
  // ============================================================

  // 1. DATA STORE CHO WIZARD
  window.wizardData = {
    shiftId: null,
    date: null,
    oldUserId: null,
    oldUserName: null,
    oldUserRole: null,
    oldEmail: null,
    newUserId: null,
    newUserName: null,
    newEmail: null,
    context: 'roster',
  };

  // 2. KHỞI TẠO LẮNG NGHE SỰ KIỆN (BỌC THÉP CHỐNG LẶP SỰ KIỆN)
  $(document).ready(function () {
    // Bước 1 -> 2: Chọn lịch trực
    $(document)
      .off('click', '.wiz-select-shift-btn')
      .on('click', '.wiz-select-shift-btn', function () {
        const id = $(this).data('id');
        const date = $(this).data('date');
        const team = $(this).data('team');
        window.selectShiftForWizard(id, date, team);
      });

    // Bước 2 -> 3 (Hoặc Bước 1 -> 3 của Incident): Chọn người cần thay thế
    $(document)
      .off('click', '.wiz-select-old-member-btn')
      .on('click', '.wiz-select-old-member-btn', function () {
        const id = $(this).data('userid') || $(this).data('id');
        const name = $(this).data('name');
        const role = $(this).data('role');
        const email = $(this).data('email');
        window.selectOldMember(id, name, role, email);
      });

    // Bước 3 -> 4: Chốt người mới
    $(document)
      .off('click', '.wiz-select-new-member-btn')
      .on('click', '.wiz-select-new-member-btn', function () {
        const id = $(this).data('userid') || $(this).data('id');
        const name = $(this).data('name');
        const email = $(this).data('email');
        window.confirmReplacement(id, name, email);
      });
  });

  // ============================================================
  // BƯỚC 1: MỞ WIZARD & TẢI DANH SÁCH CA TRỰC HOẶC SỰ CỐ
  // ============================================================
  window.openWizard = async function (context = 'roster') {
    window.wizardData = { context: context };
    window.goToStep(1);

    if (typeof window.openModal === 'function')
      window.openModal('modal-wizard');
    const container = document.getElementById('wiz-shift-list');

    if (!container) return console.error('🚨 THIẾU THẺ: #wiz-shift-list');

    container.innerHTML =
      '<div class="text-center p-4"><span class="spinner-border"></span><p>Đang tải danh sách ca...</p></div>';

    try {
      if (context === 'roster') {
        const stepInd1 = document.querySelector('#wiz-step-1 .step-indicator');
        if (stepInd1) stepInd1.textContent = 'Bước 1/3: Chọn Ca trực cần sửa';

        // Lấy dữ liệu
        if (typeof window.loadRosterData === 'function')
          await window.loadRosterData();

        const rosters = window.appState.roster_schedules || [];

        // 🔥 ĐÃ SỬA: Xóa bỏ bộ lọc ngày tháng (new Date),
        // Chỉ giữ lại điều kiện lọc loại lịch là 'roster'
        const displayRosters = rosters.filter((r) => r.shift_type === 'roster');

        container.innerHTML = '';
        if (displayRosters.length === 0) {
          container.innerHTML =
            '<div class="p-3 text-center text-muted">Không có lịch trực nào.</div>';
          return;
        }

        displayRosters.forEach((r) => {
          const isLocked = r.status === 'replaced' || r.status === 'completed';
          const date = r.duty_date || 'Không rõ ngày';
          // TẠO NGÀY HIỂN THỊ CHUẨN VIỆT NAM
          let displayDate = date;
          if (displayDate && displayDate.includes('-')) {
            const parts = displayDate.split('T')[0].split('-');
            if (parts.length === 3) {
              displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // Lật thành DD/MM/YYYY
            }
          }
          container.insertAdjacentHTML(
            'beforeend',
            `
                  <div class="list-item ${
                    isLocked ? 'locked-item' : 'wiz-select-shift-btn'
                  }" 
                       style="cursor: ${
                         isLocked ? 'not-allowed' : 'pointer'
                       }; border: 1px solid #ddd; padding: 12px; margin-bottom: 8px; border-radius: 8px; ${
              isLocked ? 'opacity:0.6' : ''
            }" 
                       data-id="${
                         r.id
                       }" data-date="${displayDate}" data-team="${
              r.team_name || ''
            }">
                      <div class="d-flex justify-content-between align-items-center">
                          <div>
                              <strong class="text-primary">📅 ${displayDate}</strong><br>
                              <small class="text-muted">Nhóm: ${
                                r.team_name || 'Không xác định'
                              }</small>
                          </div>
                          <div>
                              ${
                                isLocked
                                  ? '<span class="badge bg-secondary">Đã khóa</span>'
                                  : '<i class="bx bx-chevron-right fs-4"></i>'
                              }
                          </div>
                      </div>
                  </div>
              `
          );
        });
      }
      // ==========================================
      // NHÁNH SỰ CỐ KHẨN CẤP (INCIDENT)
      // ==========================================
      else if (context === 'incident') {
        const stepInd1 = document.querySelector('#wiz-step-1 .step-indicator');
        if (stepInd1)
          stepInd1.textContent = 'Bước 1/2: Chọn thành viên cần thay thế';

        const incidentId = window.currentDossierId;
        container.innerHTML =
          '<div class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> Đang tải danh sách nhân sự...</div>';

        try {
          const { data: inc, error } = await window.supabaseClient
            .from('incidents')
            .select('initial_selected_members')
            .eq('id', incidentId)
            .single();

          if (error) throw error;

          let emails = (inc?.initial_selected_members || '')
            .split(';')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          if (emails.length === 0) {
            container.innerHTML =
              '<div class="text-center text-muted p-3">Chưa có thành viên nào trong sự kiện.</div>';
            return;
          }

          const { data: profiles } = await window.supabaseClient
            .from('profiles')
            .select('id, full_name, email, role, position')
            .in('email', emails);

          container.innerHTML = '';
          emails.forEach((email) => {
            const p = profiles?.find(
              (prof) => prof.email.toLowerCase() === email
            ) || { email: email, full_name: email, position: 'Thành viên' };
            const name = p.full_name || email;
            const role = p.position || p.role || 'Thành viên';
            const roleClass = role.toLowerCase().includes('leader')
              ? 'bg-danger'
              : 'bg-info text-dark';

            container.insertAdjacentHTML(
              'beforeend',
              `
                    <div class="card mb-2 shadow-sm border-0 member-hover-effect wiz-select-old-member-btn" 
                         style="cursor: pointer;" 
                         data-userid="${p.id || ''}" 
                         data-email="${email}" 
                         data-name="${name}">
                        <div class="card-body p-3 d-flex align-items-center">
                            <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded-circle shadow-sm"
                                 style="width: 45px; height: 45px; background-color: #6c757d; font-size: 18px;">
                                ${name.charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-grow-1">
                                <div class="fw-bold text-dark">${
                                  window.escapeHtml
                                    ? window.escapeHtml(name)
                                    : name
                                }</div>
                                <div class="text-muted small">
                                    <span class="badge ${roleClass} rounded-pill me-1">${role}</span>
                                    ${email}
                                </div>
                            </div>
                            <div class="text-primary"><i class='bx bx-chevron-right fs-4'></i></div>
                        </div>
                    </div>
                `
            );
          });
        } catch (err) {
          container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${err.message}</div>`;
        }
      }
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">Lỗi: ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 2: TẢI DANH SÁCH NGƯỜI ĐANG TRONG CA (DÀNH RIÊNG ROSTER)
  // ============================================================
  window.selectShiftForWizard = async function (shiftId, dutyDate, teamName) {
    wizardData.shiftId = shiftId;
    wizardData.date = dutyDate;

    const stepInd2 = document.querySelector('#wiz-step-2 .step-indicator');
    if (stepInd2) stepInd2.textContent = 'Bước 2/3: Chọn nhân sự cần thay thế';

    window.goToStep(2);

    const container = document.getElementById('wiz-member-list');
    if (!container) return;

    container.innerHTML =
      '<div class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> Đang tải danh sách nhân sự trong ca...</div>';

    try {
      // 🔥 ĐÃ SỬA: Phải lấy từ 'roster_assignments' thay vì 'profiles'
      let { data: assignments, error } = await window.supabaseClient
        .from('roster_assignments')
        .select(
          `user_id, profiles ( id, full_name, email, role, position, team )`
        )
        .eq('schedule_id', shiftId);

      if (error) throw error;

      let membersToShow = [];
      if (assignments && assignments.length > 0) {
        membersToShow = assignments.map((a) => a.profiles).filter(Boolean);
      }

      // Fallback: Nếu ca này chưa gán ai nhưng có tên đội, thì bốc cả đội đó ra
      if (membersToShow.length === 0 && teamName) {
        const { data: teamMembers } = await window.supabaseClient
          .from('profiles')
          .select('id, full_name, email, role, position, team')
          .eq('team', teamName);
        if (teamMembers) membersToShow = teamMembers;
      }

      container.innerHTML = '';
      if (membersToShow.length === 0) {
        container.innerHTML = `<div class="text-center text-muted p-3">Không tìm thấy nhân sự nào thuộc ca này trong hệ thống.</div>`;
        return;
      }

      membersToShow.forEach((p) => {
        const name = p.full_name || p.email;
        const role = p.position || p.role || 'Thành viên';
        const roleClass = role.toLowerCase().includes('leader')
          ? 'bg-danger'
          : 'bg-info text-dark';

        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="card mb-2 shadow-sm border-0 member-hover-effect wiz-select-old-member-btn" 
                   style="cursor: pointer;" data-userid="${p.id}" data-email="${
            p.email
          }" data-name="${name}" data-role="${role}">
                  <div class="card-body p-3 d-flex align-items-center">
                      <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded-circle shadow-sm"
                           style="width: 45px; height: 45px; background-color: #6c757d; font-size: 18px;">
                          ${name.charAt(0).toUpperCase()}
                      </div>
                      <div class="flex-grow-1">
                          <div class="fw-bold text-dark">${
                            window.escapeHtml ? window.escapeHtml(name) : name
                          }</div>
                          <div class="text-muted small">
                              <span class="badge ${roleClass} rounded-pill me-1">${role}</span>
                              ${p.email}
                          </div>
                      </div>
                      <div class="text-primary"><i class='bx bx-chevron-right fs-4'></i></div>
                  </div>
              </div>
          `
        );
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 3: TRÌNH TÌM KIẾM NGƯỜI THAY THẾ THÔNG MINH (AI LOGIC)
  // ============================================================
  window.selectOldMember = async function (userId, name, role, email) {
    wizardData.oldUserId = userId;
    wizardData.oldUserName = name;
    wizardData.oldUserRole = role;
    wizardData.oldEmail = email;

    if (wizardData.context === 'incident') {
      wizardData.shiftId = window.currentDossierId;
    }

    const targetRoleEl = document.getElementById('wiz-target-role');
    if (targetRoleEl) targetRoleEl.innerText = role || 'Thành viên';

    window.goToStep(3);

    // Gọi hàm load mượt mà sau khi chuyển frame
    setTimeout(() => {
      window.loadReplacementCandidates();
    }, 150);
  };

  window.loadReplacementCandidates = async function () {
    const container = document.getElementById('wiz-suggestion-list');
    if (!container)
      return console.error(
        "🚨 THIẾU THẺ HTML: <div id='wiz-suggestion-list'></div>"
      );

    container.innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Hệ thống đang quét nhân sự rảnh rỗi...</p></div>';

    try {
      const isRoster = wizardData.context === 'roster';
      let finalCandidates = [];
      let busyRostersData = [];

      // ✅ BỌC THÉP 1: XỬ LÝ CHUỖI TÊN CHỨC VỤ BỊ DÍNH HTML/CẶN
      let targetPosition = 'Thành viên';
      if (wizardData.oldUserRole) {
        // Bóc tách HTML nếu có, loại bỏ khoảng trắng thừa
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = wizardData.oldUserRole;
        const cleanRole = tempDiv.textContent || tempDiv.innerText || '';
        targetPosition = cleanRole.trim();
      }

      if (isRoster) {
        // [LOGIC CA TRỰC] - Lấy danh sách rảnh
        const { data, error } = await window.supabaseClient
          .from('profiles')
          .select('id, email, full_name, team, position, deployment_status')
          .eq('deployment_status', 'Sẵn sàng')
          .neq('approval_status', 'pending');

        if (error) {
          console.warn('⚠️ Lỗi fetch profiles:', error.message);
          return;
        }

        finalCandidates = (data || []).filter((user) => {
          const oldEmail = wizardData.oldEmail?.toLowerCase();
          const userEmail = user.email?.toLowerCase();

          if (oldEmail && userEmail && userEmail === oldEmail) return false;
          if (wizardData.oldUserId && user.id === wizardData.oldUserId)
            return false;

          // Loại người đang trong sự cố khẩn cấp
          if (window.appState?.trackingIncidents) {
            const busyInIncident = window.appState.trackingIncidents.some(
              (inc) => {
                const members = (inc.members || '').toLowerCase();
                return (
                  inc.status === 'active' &&
                  (members.includes(userEmail) || members.includes(user.id))
                );
              }
            );
            if (busyInIncident) return false;
          }
          return true;
        });
      } else {
        // [LOGIC AI ĐIỀU ĐỘNG KHẨN CẤP]
        if (!wizardData.oldEmail)
          throw new Error('Không xác định được Email của người cần thay!');

        // 1. Tìm thông tin chuyên môn chính xác nếu bị rỗng
        if (!targetPosition || targetPosition === 'Thành viên') {
          const { data: oldProfile } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .ilike('email', wizardData.oldEmail.trim())
            .maybeSingle();

          if (oldProfile) {
            targetPosition =
              oldProfile.position ||
              oldProfile.academic ||
              oldProfile.role ||
              'Thành viên';
          }
        }

        // 2. Màng lọc 1: Nhân sự bận dập dịch
        const { data: activeIncidents } = await window.supabaseClient
          .from('incidents')
          .select('initial_selected_members, members')
          .eq('status', 'active');

        let busyIncidentEmails = [];
        if (activeIncidents) {
          activeIncidents.forEach((inc) => {
            // Quét cả initial và confirmed members cho chắc chắn
            const mem1 = (inc.initial_selected_members || '')
              .split(';')
              .map((m) => m.trim().toLowerCase());
            const mem2 = (inc.members || '')
              .split(';')
              .map((m) => m.trim().toLowerCase());
            busyIncidentEmails.push(...mem1, ...mem2);
          });
          // Lọc trùng
          busyIncidentEmails = [...new Set(busyIncidentEmails.filter(Boolean))];
        }

        // 3. Màng lọc 2: Nhân sự dính lịch trực
        let busyRosterIds = [];
        try {
          const todayDate = new Date();
          const yesterdayDate = new Date(todayDate);
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          const tomorrowDate = new Date(todayDate);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);

          // ✅ BỌC THÉP 2: DÙNG ĐỊNH DẠNG ISO CHUẨN YYYY-MM-DD
          const todayStr = todayDate.toISOString().split('T')[0];
          const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
          const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

          let dbDate = wizardData.date || todayStr;
          if (dbDate.includes('/')) {
            // Sửa lỗi ngày Việt Nam DD/MM/YYYY
            const parts = dbDate.split('/');
            if (parts.length === 3)
              dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else if (dbDate.includes('-')) {
            const parts = dbDate.split('-');
            if (parts[0].length <= 2)
              dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }

          const { data: busyRosters } = await window.supabaseClient
            .from('roster_assignments')
            .select('user_id, roster_schedules!inner(duty_date, team_name)')
            .in('roster_schedules.duty_date', [
              yesterdayStr,
              todayStr,
              tomorrowStr,
              dbDate,
            ])
            .in('assignment_status', ['assigned', 'confirmed']); // Kể cả pending (assigned) hay confirmed đều tính là bận

          if (busyRosters) {
            busyRostersData = busyRosters;
            busyRosterIds = busyRosters.map((r) => r.user_id);
          }
        } catch (e) {
          console.warn('Lỗi khi quét lịch trực:', e);
        }

        // 4. Lấy USER CÙNG CHỨC VỤ (Sẵn sàng)
        let query = window.supabaseClient
          .from('profiles')
          .select('*')
          .eq('approval_status', 'approved')
          .eq('deployment_status', 'Sẵn sàng'); // Thêm điều kiện sẵn sàng cho chắc

        // Nếu khác 'Thành viên', 'No position' hoặc rỗng thì mới filter theo Position
        if (
          targetPosition &&
          targetPosition !== 'Thành viên' &&
          targetPosition !== 'No position'
        ) {
          query = query.ilike('position', `%${targetPosition}%`);
        }

        const { data: matchedUsers, error: matchErr } = await query;
        if (matchErr)
          throw new Error(
            'Lỗi khi tìm người cùng chức vụ: ' + matchErr.message
          );

        // 5. THỰC THI BỘ LỌC CUỐI CÙNG
        finalCandidates = (matchedUsers || []).filter((user) => {
          if (!user.email) return false;
          const email = user.email.toLowerCase();

          if (email === wizardData.oldEmail.toLowerCase()) return false; // Loại chính họ
          if (busyIncidentEmails.includes(email)) return false; // Đang đi dập dịch
          if (!isRoster && busyRosterIds.includes(user.id)) return false; // Kẹt trực
          return true;
        });
      }

      // =======================================================
      // RENDER KẾT QUẢ ĐỀ XUẤT
      // =======================================================
      container.innerHTML = '';
      if (finalCandidates.length === 0) {
        return (container.innerHTML = `
              <div class="text-center py-4">
                  <i class='bx bx-error-circle fs-1 text-danger mb-2'></i>
                  <p>Không tìm thấy nhân sự rảnh rỗi phù hợp.<br><small class="text-muted">Mọi người cùng chuyên môn đều đang kẹt nhiệm vụ khác.</small></p>
              </div>`);
      }

      if (!isRoster) {
        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="mb-3 text-success small fw-bold d-flex align-items-center bg-light p-2 rounded">
                  <i class='bx bx-check-shield fs-5 me-2'></i> AI đã loại trừ nhân sự bận dập dịch và vướng lịch trực định kỳ.
              </div>
          `
        );
      }

      finalCandidates.forEach((user) => {
        const fullName = user.full_name || user.username || user.email;
        const extraInfo = isRoster
          ? `Đội: ${user.team || 'Không rõ'}`
          : `Chức vụ: ${user.position || user.academic || 'N/A'}`;

        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="card mb-2 shadow-sm border-0 border-start border-success border-5 wiz-select-new-member-btn" 
                   style="cursor: pointer;" data-userid="${
                     user.id
                   }" data-email="${user.email}" data-name="${window.escapeHtml(
            fullName
          )}">
                  <div class="card-body p-3 d-flex align-items-center">
                      <div class="me-3 position-relative">
                          <div class="d-flex align-items-center justify-content-center fw-bold rounded-circle" 
                               style="width: 45px; height: 45px; background-color: #e6f9ec; color: #28a745; font-size: 18px;">
                              ${fullName.charAt(0).toUpperCase()}
                          </div>
                      </div>
                      <div class="flex-grow-1">
                          <div class="d-flex justify-content-between align-items-center mb-1">
                              <span class="fw-bold text-dark">${window.escapeHtml(
                                fullName
                              )}</span>
                              <span class="badge bg-success-subtle text-success border border-success-subtle">Phù hợp</span>
                          </div>
                          <div class="text-muted small">
                              <i class='bx bx-id-card me-1'></i> ${window.escapeHtml(
                                extraInfo
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          `
        );
      });
    } catch (err) {
      console.error('Lỗi AI tìm kiếm:', err);
      container.innerHTML = `<div class="alert alert-danger p-3 text-center shadow-sm"><i class='bx bx-error fs-2'></i><br><strong>Lỗi:</strong> ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 4: XÁC NHẬN VÀ THỰC THI (DATABASE UPDATE + NOTIFICATIONS)
  // ============================================================
  window.confirmReplacement = function (newId, newName, newEmail) {
    if (newId) wizardData.newUserId = newId;
    if (newName) wizardData.newUserName = newName;
    if (newEmail) wizardData.newEmail = newEmail;

    window.submitRotation();
  };

  window.submitRotation = async function () {
    const targetId = wizardData.shiftId || window.currentDossierId;
    if (!targetId)
      return showToast('Lỗi: Không xác định được sự kiện.', 'error');
    if (!wizardData.newUserId)
      return showToast('Lỗi: Chưa chọn người thay thế.', 'error');

    showLoadingSpinner(true);

    try {
      const isRoster = wizardData.context === 'roster';

      // 1. Cập nhật dữ liệu chính
      if (isRoster) {
        const { error: updateErr } = await window.supabaseClient
          .from('roster_assignments')
          .update({
            user_id: wizardData.newUserId,
            assignment_status: 'assigned',
          })
          .eq('schedule_id', targetId)
          .eq('user_id', wizardData.oldUserId);
        if (updateErr) throw updateErr;
      } else {
        const { data: inc } = await window.supabaseClient
          .from('incidents')
          .select('initial_selected_members')
          .eq('id', targetId)
          .single();
        let membersArr = (inc?.initial_selected_members || '')
          .split(';')
          .map((e) => e.trim())
          .filter(Boolean);

        membersArr = membersArr.filter(
          (e) => e.toLowerCase() !== wizardData.oldEmail.toLowerCase()
        );
        if (!membersArr.includes(wizardData.newEmail))
          membersArr.push(wizardData.newEmail);

        const { error: incErr } = await window.supabaseClient
          .from('incidents')
          .update({ initial_selected_members: membersArr.join(';') })
          .eq('id', targetId);
        if (incErr) throw incErr;

        await window.supabaseClient.from('deployment_history').insert([
          {
            incident_id: targetId,
            user_id: wizardData.oldUserId,
            replaced_by: wizardData.newUserId,
            action_type: 'replaced',
            reason: 'Cập nhật nhân sự bằng AI',
          },
        ]);
      }

      // 2. Định nghĩa nội dung thông báo (để tránh lỗi ReferenceError)
      const dateStr = wizardData.date ? ` ngày ${wizardData.date}` : '';
      const notifyOld = isRoster
        ? `Bạn đã được thay thế bởi ${
            wizardData.newUserName || 'người mới'
          } cho ca trực${dateStr}.`
        : `Bạn đã được rút khỏi lệnh điều động khẩn cấp${dateStr}.`;
      const notifyNew = isRoster
        ? `Bạn được phân công thay cho ${
            wizardData.oldUserName || wizardData.oldEmail
          } vào ca trực${dateStr}.`
        : `Bạn vừa được hệ thống tự động chọn tham gia dập dịch khẩn cấp${dateStr}!`;

      // 3. Tạo payload KHÔNG CÓ cột 'channels'
      // Thay đoạn tạo payload thành như thế này:
      // Dựa trên ảnh: id, user_email, message, is_read, created_at, notification_type, incident_id, schedule_id, response_status, responded_at
      const notificationsPayload = [
        {
          user_email: wizardData.oldEmail,
          message: notifyOld,
          notification_type: 'thong_tin',
          incident_id: !isRoster ? targetId : null,
          schedule_id: isRoster ? targetId : null,
        },
        {
          user_email: wizardData.newEmail,
          message: notifyNew,
          notification_type: 'thay_the',
          incident_id: !isRoster ? targetId : null,
          schedule_id: isRoster ? targetId : null,
        },
      ];

      // Gửi thông báo
      await window.supabaseClient
        .from('notifications')
        .insert(notificationsPayload);

      showToast('Thay đổi nhân sự thành công!', 'success');

      // 4. Refresh UI
      window.wizardData = {};
      if (typeof window.closeModal === 'function')
        window.closeModal('modal-wizard');
      if (typeof window.reloadData === 'function')
        await window.reloadData({ showSpinner: false, refreshUI: true });

      if (!isRoster && typeof window.openDossierView === 'function') {
        const { data: updatedInc } = await window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', targetId)
          .single();
        if (updatedInc)
          window.openDossierView(
            encodeURIComponent(JSON.stringify(updatedInc))
          );
      }
    } catch (err) {
      console.error('❌ Lỗi SubmitRotation:', err);
      showToast('Lỗi server: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  // ============================================================
  // CÁC HÀM XỬ LÝ KHÁC (GIỮ NGUYÊN HOÀN TOÀN)
  // ============================================================
  window.goToStep = function (stepNumber) {
    document
      .querySelectorAll('.step-container')
      .forEach((el) => el.classList.remove('step-active'));
    const target = document.getElementById('wiz-step-' + stepNumber);
    if (target) target.classList.add('step-active');
  };

  let currentCalDate = new Date();

  window.renderRosterPage = function () {
    const teamSelect = document.getElementById('new-shift-team');
    if (teamSelect && teamSelect.options.length <= 1) {
      let opts = '<option value="">-- Chọn Đội --</option>';
      for (let i = 1; i <= 10; i++) {
        opts += `<option value="Team ${i}">Team ${i}</option>`;
      }
      teamSelect.innerHTML = opts;
    }
    window.reloadData({ showSpinner: true, refreshUI: true });
  };

  window.renderCalendar = async function () {
    try {
      const container = document.getElementById('calendar-grid');
      if (!container) return;

      const year = currentCalDate.getFullYear();
      const month = currentCalDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date();

      const monthNames = [
        'Tháng 1',
        'Tháng 2',
        'Tháng 3',
        'Tháng 4',
        'Tháng 5',
        'Tháng 6',
        'Tháng 7',
        'Tháng 8',
        'Tháng 9',
        'Tháng 10',
        'Tháng 11',
        'Tháng 12',
      ];
      const titleEl = document.getElementById('cal-month-title');
      if (titleEl) titleEl.innerText = `${monthNames[month]} / ${year}`;

      let fullGridHtml = `
          <div class="cal-day-header" style="color:#dc3545">CN</div>
          <div class="cal-day-header">T2</div><div class="cal-day-header">T3</div>
          <div class="cal-day-header">T4</div><div class="cal-day-header">T5</div>
          <div class="cal-day-header">T6</div><div class="cal-day-header">T7</div>
      `;

      for (let i = 0; i < firstDayOfMonth; i++) {
        fullGridHtml += `<div class="cal-cell empty"></div>`;
      }

      const rosters = window.appState.roster_schedules || [];

      for (let day = 1; day <= daysInMonth; day++) {
        const isToday =
          day === today.getDate() &&
          month === today.getMonth() &&
          year === today.getFullYear();
        let shiftsHtml = '';

        const dayRosters = rosters.filter((r) => {
          if (!r.duty_date) return false;
          const rDate = new Date(r.duty_date);
          return (
            rDate.getDate() === day &&
            rDate.getMonth() === month &&
            rDate.getFullYear() === year
          );
        });

        dayRosters.forEach((r) => {
          const safeId = String(r.id || '').replace(/'/g, "\\'");
          const safeTeam = window.escapeHtml
            ? window.escapeHtml(r.team_name || 'Không tên')
            : r.team_name || 'Không tên';
          const isIncident = r.shift_type === 'incident';
          const shiftText = isIncident ? 'Sự cố' : 'Định kỳ';
          const borderCol = isIncident ? '#dc3545' : '#0d6efd';
          const badgeBg = isIncident
            ? 'bg-danger-subtle text-danger'
            : 'bg-primary-subtle text-primary';

          shiftsHtml += `
                  <div class="shift-tag" style="border-left: 3px solid ${borderCol}; padding-left:4px; margin-bottom:4px; cursor:pointer;" data-action="view-roster" data-id="${safeId}">
                      <div class="d-flex justify-content-between align-items-center">
                          <span style="font-weight:bold; font-size:12px; color: #333;">${safeTeam}</span>
                      </div>
                      <div style="margin-top: 2px;">
                          <span class="badge ${badgeBg}" style="font-size:9px; padding: 2px 4px;">${shiftText}</span>
                      </div>
                  </div>`;
        });

        fullGridHtml += `
              <div class="cal-cell ${
                isToday ? 'today' : ''
              }" data-date="${year}-${month + 1}-${day}">
                  <span class="day-num">${day}</span>
                  <div class="shifts-container">${shiftsHtml}</div>
              </div>`;
      }

      container.innerHTML = fullGridHtml;

      container
        .querySelectorAll('[data-action="view-roster"]')
        .forEach((el) => {
          el.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const rosterId = this.getAttribute('data-id');
            if (rosterId && typeof window.viewRosterDetail === 'function')
              window.viewRosterDetail(rosterId);
          };
        });
    } catch (err) {
      console.error('❌ renderCalendar error:', err);
    }
  };

  window.prevMonth = function () {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
  };
  window.nextMonth = function () {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
  };
  window.todayMonth = function () {
    currentCalDate = new Date();
    renderCalendar();
  };

  window.viewRosterDetail = async function (rosterId) {
    try {
      if (document.activeElement) document.activeElement.blur();
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      const rosters = window.appState.roster_schedules || [];
      const shift = rosters.find(
        (r) => String(r.id).trim() === String(rosterId).trim()
      );

      if (!shift) throw new Error('Không tìm thấy dữ liệu ca trực này.');

      document.getElementById('detail-roster-team').textContent =
        shift.team_name || 'Chưa rõ';

      let displayDate = shift.duty_date || '';
      if (displayDate.includes('-')) {
        const parts = displayDate.split('T')[0].split('-');
        if (parts.length === 3)
          displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      document.getElementById('detail-roster-date').textContent = displayDate;
      document.getElementById('detail-roster-id').textContent =
        shift.note || '';

      const [profilesRes, assignmentsRes] = await Promise.all([
        window.supabaseClient
          .from('profiles')
          .select('*')
          .eq('team', shift.team_name),
        window.supabaseClient
          .from('roster_assignments')
          .select('*')
          .eq('schedule_id', shift.id),
      ]);

      const teamMembers = profilesRes.data || [];
      const assignments = assignmentsRes.data || [];
      const container = document.getElementById('detail-roster-members');
      container.innerHTML = '';

      if (teamMembers.length === 0) {
        container.innerHTML =
          '<div class="text-center text-muted p-3">Đội này hiện chưa có thành viên nào trong hệ thống.</div>';
      } else {
        let confirmedCount = 0;

        teamMembers.forEach((member) => {
          const name = member.full_name || member.email;
          const role = member.position || member.role || 'Thành viên';
          const assignRecord = assignments.find((a) => a.user_id === member.id);
          const status = assignRecord
            ? assignRecord.assignment_status
            : 'pending';

          let statusHtml = '';
          let opacity = '1';

          if (status === 'confirmed' || status === 'assigned') {
            statusHtml = `<span class="badge bg-success-subtle text-success" style="font-size:11px;"><i class='bx bx-check'></i> Đã nhận</span>`;
            confirmedCount++;
          } else if (status === 'declined') {
            statusHtml = `<span class="badge bg-danger-subtle text-danger" style="font-size:11px;">Đã từ chối</span>`;
            opacity = '0.6';
          } else {
            statusHtml = `<span class="badge bg-warning-subtle text-warning" style="font-size:11px;"><i class='bx bx-time'></i> Chưa phản hồi</span>`;
          }

          container.insertAdjacentHTML(
            'beforeend',
            `
                  <div class="list-group-item border-0 border-bottom d-flex align-items-center p-2" style="opacity: ${opacity};">
                      <div class="me-3 d-flex align-items-center justify-content-center shadow-sm" style="width: 40px; height: 40px; background-color: #f0f2f5; border-radius: 50%; font-weight: bold;">
                          ${name.charAt(0).toUpperCase()}
                      </div>
                      <div class="flex-grow-1">
                          <div class="fw-bold text-dark" style="font-size: 14px;">${
                            window.escapeHtml ? window.escapeHtml(name) : name
                          }</div>
                          <div class="text-muted small">${
                            window.escapeHtml ? window.escapeHtml(role) : role
                          }</div>
                      </div>
                      <div>${statusHtml}</div>
                  </div>
              `
          );
        });

        const statusEl = document.getElementById('detail-roster-status');
        if (confirmedCount === 0) {
          statusEl.innerHTML = `<span class="badge bg-warning text-dark">Đang chờ xác nhận (0/${teamMembers.length})</span>`;
        } else if (confirmedCount < teamMembers.length) {
          statusEl.innerHTML = `<span class="badge bg-info text-dark">Đã nhận một phần (${confirmedCount}/${teamMembers.length})</span>`;
        } else {
          statusEl.innerHTML = `<span class="badge bg-success">Đã xác nhận đủ</span>`;
        }
      }

      const btnDelete = document.getElementById('btn-delete-roster');
      if (btnDelete) {
        btnDelete.onclick = null;
        if (window.userSession?.role?.toLowerCase() === 'admin') {
          btnDelete.style.display = 'block';
          btnDelete.onclick = async function () {
            document.activeElement.blur();
            showToastConfirm(
              `Xóa ca trực ngày ${displayDate}?`,
              async function () {
                if (typeof showLoadingSpinner === 'function')
                  showLoadingSpinner(true);
                try {
                  const { error } = await window.supabaseClient
                    .from('roster_schedules')
                    .delete()
                    .eq('id', shift.id);
                  if (error) throw error;
                  showToast('Đã xóa thành công!', 'success');
                  if (typeof window.closeModal === 'function')
                    window.closeModal('modal-roster-detail');
                  window.reloadData({ showSpinner: false, refreshUI: true });
                } catch (err) {
                  showToast('Lỗi xóa: ' + err.message, 'error');
                } finally {
                  if (typeof hideLoadingSpinner === 'function')
                    hideLoadingSpinner();
                }
              }
            );
          };
        } else {
          btnDelete.style.display = 'none';
        }
      }

      if (typeof window.openModal === 'function')
        window.openModal('modal-roster-detail');
    } catch (err) {
      console.error('viewRosterDetail error:', err);
      showToast('Lỗi hiển thị chi tiết: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  window.reloadData = async function (options = {}) {
    const { showSpinner = true, refreshUI = true } = options;
    if (showSpinner && typeof showLoadingSpinner === 'function')
      showLoadingSpinner(true);
    try {
      await window.loadRosterData();
      if (refreshUI && typeof renderCalendar === 'function')
        await renderCalendar();
    } catch (err) {
      showToast('Lỗi tải lại dữ liệu: ' + err.message, 'error');
    } finally {
      if (showSpinner && typeof hideLoadingSpinner === 'function')
        hideLoadingSpinner();
    }
  };

// PATCH 15 (v3): Hiển thị TẤT CẢ incident đang active trên lịch,
// không phụ thuộc trạng thái của từng activity con bên trong
window.loadRosterData = async function () {
  try {
    let combinedData = [];

    // 1. Lịch trực định kỳ (giữ nguyên)
    const { data: rosters, error: rosterErr } = await window.supabaseClient
      .from('roster_schedules')
      .select('*')
      .order('duty_date', { ascending: false });
    if (rosterErr) throw rosterErr;

    if (rosters) {
      combinedData = rosters.map((r) => ({
        id: r.id,
        duty_date: r.duty_date,
        team_name: r.team_name,
        status: r.status,
        note: r.note || '',
        shift_type: r.shift_type || 'roster',
      }));
    }

    // 2. Sự cố khẩn cấp — LẤY THEO incident.status, KHÔNG theo activity
    try {
      const { data: incidents, error: incErr } = await window.supabaseClient
        .from('incidents')
        .select('id, event_name, status, activation_time')
        .eq('status', 'active'); // ← Chỉ cần incident còn active
      if (incErr) throw incErr;

      if (incidents && incidents.length > 0) {
        const incidentIds = incidents.map((i) => i.id);

        // Lấy thêm activities để biết % hoàn thành (hiển thị phụ, không dùng để filter)
        const { data: activities } = await window.supabaseClient
          .from('incident_activities')
          .select('incident_id, status')
          .in('incident_id', incidentIds);

        const progressMap = {};
        (activities || []).forEach((a) => {
          if (!progressMap[a.incident_id]) {
            progressMap[a.incident_id] = { total: 0, done: 0 };
          }
          progressMap[a.incident_id].total++;
          if (a.status === 'completed') progressMap[a.incident_id].done++;
        });

        const formattedIncidents = incidents
          .map((inc) => {
            if (!inc.activation_time) return null; // Không có ngày thật → bỏ

            const validDate = String(inc.activation_time).split('T')[0];
            const prog = progressMap[inc.id];
            const progressText = prog
              ? ` (${prog.done}/${prog.total} HĐ xong)`
              : '';

            return {
              id: inc.id,
              duty_date: validDate,
              team_name: inc.event_name || 'Sự cố',
              status: inc.status, // Luôn là 'active' vì đã filter ở query
              note: 'Điều động khẩn cấp' + progressText,
              shift_type: 'incident',
              incident_id: inc.id,
            };
          })
          .filter(Boolean);

        combinedData = [...combinedData, ...formattedIncidents];
      }
    } catch (e) {
      console.warn('⚠️ Bỏ qua dữ liệu Sự cố:', e.message);
    }

    window.appState = window.appState || {};
    window.appState.roster_schedules = combinedData;
    return combinedData;
  } catch (err) {
    console.error('❌ loadRosterData error:', err);
    return [];
  }
};

  async function waitForSupabaseReady(timeout = 10000) {
    if (window.supabaseClient?.auth) return true;
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (window.supabaseClient?.auth) return resolve(true);
        if (Date.now() - startTime > timeout)
          return reject(
            new Error('Supabase client not initialized after ' + timeout + 'ms')
          );
        setTimeout(check, 100);
      };
      check();
    });
  }

  window.submitNewShift = async function () {
    const date = document.getElementById('new-shift-date').value;
    const team = document.getElementById('new-shift-team').value;
    const note = document.getElementById('new-shift-note').value;

    if (!date || !team)
      return showToast('Vui lòng chọn ngày và đội.', 'warning');

    showLoadingSpinner();

    try {
      // ✅ LẤY USER ID HIỆN TẠI
      const currentUserId =
        window.userSession?.id ||
        (await window.supabaseClient.auth.getUser())?.data?.user?.id;

      // 1. Tạo lịch mới + lưu created_by
      const { data: newShift, error: shiftErr } = await window.supabaseClient
        .from('roster_schedules')
        .insert([
          {
            duty_date: date,
            team_name: team,
            note: note,
            shift_type: 'roster',
            status: 'active',
            created_by: currentUserId, // ✅ THÊM DÒNG NÀY
          },
        ])
        .select('id')
        .single();

      if (shiftErr) throw shiftErr;

      // 2. Lấy danh sách thành viên của team
      const { data: teamMembers, error: profileErr } =
        await window.supabaseClient
          .from('profiles')
          .select('id, email, team')
          .eq('team', team);

      if (profileErr) throw profileErr;

      if (teamMembers && teamMembers.length > 0) {
        // 3. Tạo assignments
        const assignments = teamMembers.map((m) => ({
          schedule_id: newShift.id,
          user_id: m.id,
          assignment_status: 'pending',
        }));

        const { error: assignErr } = await window.supabaseClient
          .from('roster_assignments')
          .insert(assignments);

        if (assignErr) throw assignErr;

        // 4. Tạo notifications
        const memberEmails = teamMembers.map((m) => m.email).filter(Boolean);
        const displayDate = date.split('-').reverse().join('/');

        const notificationsPayload = memberEmails.map((email) => ({
          user_email: email,
          message: `📅 Lịch trực định kỳ: Bạn được phân công trực ngày ${displayDate} cùng ${team}.`,
          // Nếu notifications có thêm cột, có thể thêm:
          notification_type: 'truc_ban',
          schedule_id: newShift.id,
          //created_by: currentUserId
        }));

        await window.supabaseClient
          .from('notifications')
          .insert(notificationsPayload);
      }

      showToast('Tạo lịch thành công!', 'success');
      if (typeof window.reloadData === 'function')
        await window.reloadData({ refreshUI: true });
    } catch (err) {
      console.error('❌ submitNewShift error:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

window.submitIncidentResponse = async function (actionType) {
    if (!window.selectedIncidentId) return;
    
    // Lấy thông tin user
    const myEmail = String(window.userSession?.email || '').toLowerCase().trim();
    const myUserId = window.userSession?.id; // Lấy thêm ID để lưu lịch sử
    
    if (!myEmail)
      return showToast('Lỗi: Không tìm thấy email của bạn', 'error');

    showLoadingSpinner();
    try {
      // 1. Kéo dữ liệu sự kiện hiện tại về
      const { data: inc, error: fetchErr } = await window.supabaseClient
        .from('incidents')
        .select('members, declined_members')
        .eq('id', window.selectedIncidentId)
        .single();
      if (fetchErr) throw fetchErr;

      let confirmedArr = (inc.members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      let declinedArr = (inc.declined_members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      // 2. Logic thêm/bớt danh sách
      if (actionType === 'confirm') {
        if (!confirmedArr.includes(myEmail)) confirmedArr.push(myEmail);
        declinedArr = declinedArr.filter((e) => e !== myEmail);
      } else if (actionType === 'decline') {
        if (!declinedArr.includes(myEmail)) declinedArr.push(myEmail);
        confirmedArr = confirmedArr.filter((e) => e !== myEmail);
      }

      // 3. Cập nhật vào bảng incidents
      const { error: updateErr } = await window.supabaseClient
        .from('incidents')
        .update({
          members: confirmedArr.join(';'),
          declined_members: declinedArr.join(';'),
          confirmations: confirmedArr.length,
        })
        .eq('id', window.selectedIncidentId);

      if (updateErr) throw updateErr;

      // ==============================================================
      // 🔥 BƯỚC MỚI: GHI NHẬT KÝ VÀO BẢNG DEPLOYMENT_HISTORY 🔥
      // ==============================================================
      if (myUserId) {
          const actionText = actionType === 'confirm' ? 'Thành viên' : 'Đã từ chối';
          
          // Dùng upsert (hoặc insert) để ghi lại hành động của nhân sự
          const { error: historyErr } = await window.supabaseClient
            .from('deployment_history')
            .upsert({
                incident_id: window.selectedIncidentId,
                user_id: myUserId,
                action_type: actionText,
                // created_at sẽ tự động lấy thời gian hiện tại
            }, { onConflict: 'incident_id, user_id' }); // Tránh tạo ra nhiều dòng nếu user bấm đổi ý liên tục
            
          if (historyErr) console.warn("Lỗi lưu lịch sử thực chiến:", historyErr);
      }
      // ==============================================================

      showToast(
        actionType === 'confirm'
          ? 'Đã xác nhận tham gia!'
          : 'Đã từ chối tham gia!',
        'success'
      );

      // 4. Làm mới giao diện
      const { data: updatedInc } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .eq('id', window.selectedIncidentId)
        .single();
        
      if (updatedInc) {
        const newIncString = encodeURIComponent(JSON.stringify(updatedInc));
        window.currentDossierString = newIncString;
        if (window.appState && window.appState.trackingIncidents) {
          const idx = window.appState.trackingIncidents.findIndex(
            (i) => String(i.id) === String(updatedInc.id)
          );
          if (idx !== -1) window.appState.trackingIncidents[idx] = updatedInc;
        }
        if (typeof window.openDossierView === 'function')
          window.openDossierView(newIncString);
      }
      if (typeof window.renderTrackingPage === 'function')
        window.renderTrackingPage(true);
        
    } catch (error) {
      showToast('Lỗi hệ thống: ' + error.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  window.getUserName = function (key) {
    if (!key) return 'Unknown';
    const cleanKey = String(key).trim().toLowerCase();
    if (
      window.userSession &&
      (String(window.userSession.email).toLowerCase() === cleanKey ||
        String(window.userSession.username).toLowerCase() === cleanKey)
    ) {
      return 'Tôi (' + window.userSession.username + ')';
    }
    if (window.appState && window.appState.userDirectory) {
      const nameFound = window.appState.userDirectory[cleanKey];
      if (nameFound) return nameFound;
    }
    if (window.appState && Array.isArray(window.appState.teamData)) {
      const member = window.appState.teamData.find(
        (m) =>
          (m.email && String(m.email).trim().toLowerCase() === cleanKey) ||
          (m.username && String(m.username).trim().toLowerCase() === cleanKey)
      );
      if (member) return member.fullName || member.username;
    }
    if (cleanKey.includes('@')) return key.split('@')[0];
    return key;
  };

  // === MAP - LEAFLET VERSION (FINAL PROFESSIONAL VERSION) ===

  // ============================================================
  // 1. KHAI BÁO BIẾN TOÀN CỤC & CSS HIỆU ỨNG
  // ============================================================
  let map;
  let geojsonData;
  let companyData = [];
  let filteredData = [];
  let incidentData = []; // Dữ liệu sự kiện khẩn cấp

  let geojsonBaseLayer;
  let choroplethLayer;
  let markersLayerGroup;
  let incidentsLayerGroup; // Layer cho sự kiện
  let legend;

  // Thêm CSS hiệu ứng chớp tắt (Pulse) cho các sự kiện khẩn cấp trực tiếp bằng JS
  const pulseCSS = `
    .incident-marker-active {
      background-color: #ff0000;
      border-radius: 50%;
      box-shadow: 0 0 0 rgba(255, 0, 0, 0.4);
      animation: pulse-red 1.5s infinite;
      border: 2px solid #fff;
    }
    .incident-marker-resolved {
      background-color: #6b7280;
      border-radius: 50%;
      border: 2px solid #fff;
    }
    @keyframes pulse-red {
      0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(255, 0, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
    }
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${pulseCSS}</style>`);

  // Bản màu ngành
  const industryColors = {
    'Ban Giám đốc': '#4CAF50',
    'Tổ chức hành chính': '#2E7D32',
    'Tài chính kế toán': '#0288D1',
    'Kế hoạch nghiệp vụ': '#6D4C41',
    'Công nghệ thông tin': '#78909C',
    'Đào tạo nghiên cứu khoa học và hợp tác quốc tế': '#FFCA28',
    'Phòng khám': '#0288D1',
    'Giám sát cảnh báo chuẩn bị và đáp ứng khẩn cấp dịch bệnh': '#D81B60',
    'Phòng chống bệnh truyền nhiễm cấp tính': '#FBC02D',
    'Kiểm dịch y tế quốc tế': '#5E35B1',
    'Phòng chống HIV/AIDS và các bệnh truyền nhiễm mãn tính': '#03396c',
    'Xét nghiệm': '#00ACC1',
    'Truyền thông giáo dục sức khỏe': '#C2185B',
    'Dược - Vật tư Y tế': '#7B1FA2',
    'Dinh dưỡng – Bệnh không lây': '#1976D2',
  };

  // ============================================================
  // 2. CÁC HÀM TIỆN ÍCH CHO BẢN ĐỒ
  // ============================================================
  function getColor(d) {
    if (d === 0) return '#fae1e1';
    return d > 5
      ? '#800026'
      : d > 3
      ? '#BD0026'
      : d > 1
      ? '#E31A1C'
      : '#FC4E2A';
  }

  function style(feature) {
    const count = feature.properties.count || 0;
    return {
      fillColor: getColor(count),
      weight: 2,
      opacity: 1,
      color: 'white',
      dashArray: '3',
      fillOpacity: 0.7,
    };
  }

  // ============================================================
  // 1. HÀM HIGHLIGHT (Tuyệt đối không dùng bringToFront)
  // ============================================================
  function highlightFeature(e) {
    const layer = e.target;
    layer.setStyle({
      fillColor: '#ed1384',
      weight: 3, // Tăng độ dày viền lên 3 để nổi bật (thay vì đẩy layer lên)
      color: '#ffffff', // Viền trắng
      dashArray: '',
      fillOpacity: 0.9,
    });
    // ❌ ĐÃ XÓA HOÀN TOÀN LỆNH layer.bringToFront();
  }

  // ============================================================
  // 2. HÀM RESET MÀU & ÉP ĐÓNG TOOLTIP
  // ============================================================
  function resetHighlight(e) {
    const layer = e.target;

    // Trả lại màu gốc
    if (choroplethLayer) {
      choroplethLayer.resetStyle(layer);
    } else if (typeof style === 'function' && layer.feature) {
      layer.setStyle(style(layer.feature));
    }

    // 🔥 Bồi thêm cú đấm: Ép đóng Tooltip ngay lập tức nếu nó còn ngoan cố mở
    if (layer.isTooltipOpen()) {
      layer.closeTooltip();
    }
  }

  // ============================================================
  // 3. HÀM GÁN SỰ KIỆN (Khai báo Tooltip 1 lần duy nhất)
  // ============================================================
  function onEachFeatureChoropleth(feature, layer) {
    const props = feature.properties;
    const name =
      props.name ||
      props.tenXa ||
      props.ma_xa ||
      props.MA_XA ||
      'Chưa xác định';
    const count = props.count || 0;

    // Khai báo Tooltip ĐÚNG 1 LẦN, không gỡ ra gắn vào nữa
    layer.bindTooltip(`<b>${name}</b>`, {
      permanent: false,
      direction: 'auto',
      sticky: true,
      className: 'leaflet-tooltip-own', // Thêm class để phòng hờ
    });

    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
      click: (e) => {
        const popupContent = `
          <div style="text-align: center; min-width: 120px;">
              <b style="color: #ed1384; font-size: 15px;">${name}</b><br/>
              <span style="font-size: 13px;">Nhân sự RRT: <b>${count}</b></span>
          </div>
        `;
        layer.bindPopup(popupContent).openPopup();
      },
    });
  }

  // ============================================================
  // 3. TẠO CÁC LỚP LAYER (MARKERS & INCIDENTS)
  // ============================================================
  function createMarkersLayer(data) {
    const markers = L.layerGroup();
    if (Array.isArray(data)) {
      data.forEach((c) => {
        const lat = parseFloat(c.lat);
        const lon = parseFloat(c.lon);
        if (c && !isNaN(lat) && !isNaN(lon) && c.maXa) {
          const marker = L.circleMarker([lat, lon], {
            radius: 5,
            fillColor: industryColors[c.department] || '#FF5722',
            color: '#000',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
          });
          marker.bindPopup(`
            <b>${c.fullName || 'N/A'}</b><br/>
            Khoa/phòng: ${c.department || 'N/A'}<br/>
            Chức vụ: ${c.employeeStatus || 'N/A'}
          `);
          marker.bindTooltip(c.fullName || 'RRT Member', {
            permanent: false,
            direction: 'top',
            offset: L.point(0, -10),
          });
          markers.addLayer(marker);
        }
      });
    }
    return markers;
  }

  function createIncidentsLayer(data) {
    const layerGroup = L.layerGroup();
    const usedCoords = new Set();

    if (Array.isArray(data)) {
      data.forEach((inc) => {
        let lat = parseFloat(inc.latitude || inc.lat);
        let lon = parseFloat(inc.longitude || inc.lon);

        if (!isNaN(lat) && !isNaN(lon)) {
          let coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
          if (usedCoords.has(coordKey)) {
            lat += (Math.random() - 0.5) * 0.003;
            lon += (Math.random() - 0.5) * 0.003;
          }
          usedCoords.add(coordKey);

          const isActive = ['active', 'pending', 'monitoring'].includes(
            (inc.status || '').toLowerCase()
          );
          const customIcon = L.divIcon({
            className: isActive
              ? 'incident-marker-active'
              : 'incident-marker-resolved',
            iconSize: isActive ? [16, 16] : [10, 10],
            iconAnchor: isActive ? [8, 8] : [5, 5],
          });

          // ==========================================
          // MAPPING CHUẨN XÁC TỪ COMPANY DATA MỚI
          // ==========================================
          let membersListHtml =
            '<span style="color:#9ca3af; font-style:italic;">Chưa có nhân sự</span>';

          if (inc.members) {
            const emails = inc.members
              .split(';')
              .map((e) => e.trim())
              .filter(Boolean);
            if (emails.length > 0) {
              membersListHtml = emails
                .map((email) => {
                  const searchKey = email.toLowerCase();

                  // Dò bằng email hoặc bằng đoạn chữ trước dấu @ (để bắt pasteurpk)
                  const user = companyData.find(
                    (u) =>
                      (u.email && u.email.toLowerCase() === searchKey) ||
                      (u.email &&
                        u.email.split('@')[0].toLowerCase() === searchKey) ||
                      (u.username && u.username.toLowerCase() === searchKey)
                  );

                  if (user) {
                    // Đã lấy được tên và team từ CSDL
                    const name = user.full_name || user.fullName || email;
                    const team =
                      user.team &&
                      user.team !== 'No team' &&
                      user.team !== 'undefined'
                        ? ` <i>(<span style="color:#2ca3af;">${user.team}</span>)</i>`
                        : '';
                    return `• <b>${name}</b>${team}`;
                  }
                  return `• ${email}`;
                })
                .join('<br/>');
            }
          }

          const marker = L.marker([lat, lon], { icon: customIcon });

          marker.bindPopup(`
            <div style="min-width: 250px; font-family: 'Inter', sans-serif;">
              <h6 style="color: ${
                isActive ? '#dc2626' : '#4b5563'
              }; margin-bottom: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px;">
                ${isActive ? '🚨 ĐANG KÍCH HOẠT' : '✅ ĐÃ KẾT THÚC'}
              </h6>
              <b style="color: #1f2937;">Sự kiện:</b> ${
                inc.event_name || 'Không rõ'
              }<br/>
              <b style="color: #1f2937;">Địa điểm:</b> ${
                inc.location_text || 'N/A'
              }<br/>
              <b style="color: #1f2937;">Thời gian:</b> ${
                inc.activation_time
                  ? new Date(inc.activation_time).toLocaleString('vi-VN')
                  : 'N/A'
              }<br/>
              <hr style="margin: 10px 0; border-top: 1px dashed #cbd5e1;" />
              <b style="color: #0369a1;"><i class='bx bx-group'></i> Nhân sự tham gia:</b>
              <div style="max-height: 120px; overflow-y: auto; font-size: 13px; color: #4b5563; margin-top: 4px; padding-left: 4px; border-left: 2px solid #e2e8f0; line-height: 1.6;">
                ${membersListHtml}
              </div>
            </div>
          `);

          marker.bindTooltip(
            `${isActive ? '🚨' : '✅'} ${inc.event_name || 'Sự cố'}`,
            {
              permanent: false,
              direction: 'top',
              offset: L.point(0, -10),
            }
          );
          layerGroup.addLayer(marker);
        }
      });
    }
    return layerGroup;
  }

  // ============================================================
  // 4. VẼ VÀ ĐỒNG BỘ BẢN ĐỒ
  // ============================================================
  function renderMap() {
    if (!geojsonData || !geojsonData.features) {
      console.warn('Dữ liệu bản đồ chưa sẵn sàng.');
      return;
    }

    // Tính toán thống kê nhân sự theo xã
    const countsByMaXa = new Map();
    if (Array.isArray(filteredData)) {
      filteredData.forEach((member) => {
        const maXaKey = String(member.maXa || member.ma_xa || '');
        if (maXaKey) {
          countsByMaXa.set(maXaKey, (countsByMaXa.get(maXaKey) || 0) + 1);
        }
      });
    }

    // Cập nhật GeoJSON
    const updatedGeoJson = JSON.parse(JSON.stringify(geojsonData));
    updatedGeoJson.features.forEach((feature) => {
      const props = feature.properties;
      if (props) {
        const maXa = String(props.maXa || props.MA_XA || '');
        props.count = countsByMaXa.get(maXa) || 0;
        if (!props.name && props.tenXa) props.name = props.tenXa;
      }
    });

    // DỌN DẸP LỚP CŨ
    if (map) {
      if (choroplethLayer) map.removeLayer(choroplethLayer);
      if (markersLayerGroup) map.removeLayer(markersLayerGroup);
      if (incidentsLayerGroup) map.removeLayer(incidentsLayerGroup);
    }

    // TẠO LỚP MỚI
    choroplethLayer = L.geoJSON(updatedGeoJson, {
      style:
        typeof style === 'function'
          ? style
          : () => ({ weight: 1, color: '#666', fillOpacity: 0.7 }),
      onEachFeature:
        typeof onEachFeatureChoropleth === 'function'
          ? onEachFeatureChoropleth
          : null,
    });

    markersLayerGroup = createMarkersLayer(filteredData);
    incidentsLayerGroup = createIncidentsLayer(incidentData);

    // Xếp thứ tự lớp: Choropleth (Dưới) -> Markers -> Incidents (Trên cùng)
    if (markersLayerGroup.setZIndex) markersLayerGroup.setZIndex(500);
    if (incidentsLayerGroup.setZIndex) incidentsLayerGroup.setZIndex(1000);

    // KIỂM TRA ĐIỀU KIỆN HIỂN THỊ
    // Giả sử bạn có checkbox id="toggleFillMap" để bật tắt, nếu không có mặc định sẽ hiện hết
    const toggleCheckbox = document.getElementById('toggleFillMap');
    const showAll = !toggleCheckbox || toggleCheckbox.checked;

    if (showAll) {
      if (choroplethLayer) choroplethLayer.addTo(map);
      if (markersLayerGroup) markersLayerGroup.addTo(map);
      if (incidentsLayerGroup) incidentsLayerGroup.addTo(map);
    }
  }

  // ============================================================
  // 5. LUỒNG TẢI DỮ LIỆU CHÍNH (RENDER PAGE)
  // ============================================================
  window.loadGeoJSON = async function () {
    if (window.appState && window.appState.mapGeoData) {
      geojsonData = window.appState.mapGeoData;
      return geojsonData;
    }
    try {
      console.log('Đang tải bản đồ từ Supabase...');
      const { data, error } = await window.supabaseClient.storage
        .from('maps')
        .download('hcm_map.json');
      if (error) throw error;

      const text = await data.text();
      const json = JSON.parse(text);
      if (!json.features) throw new Error("File JSON thiếu 'features'.");

      window.appState.mapGeoData = json;
      geojsonData = json;
      return json;
    } catch (err) {
      console.error('Lỗi xử lý file bản đồ:', err);
      if (typeof showToast === 'function')
        showToast('Lỗi tải bản đồ.', 'error');
      return null;
    }
  };

  function setupMapPlugins() {
    if (typeof L.Control.Draw !== 'undefined') {
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      const drawControl = new L.Control.Draw({
        position: 'topleft',
        draw: { circle: false, rectangle: false },
        edit: { featureGroup: drawnItems },
      });
      map.addControl(drawControl);
      map.on('draw:created', (e) => drawnItems.addLayer(e.layer));
    }
    if (typeof L.control.browserPrint !== 'undefined') {
      L.control.browserPrint({ title: 'In bản đồ RRT' }).addTo(map);
    }
  }

  async function renderMapPage() {
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner();
    try {
      if (!window.appState || !window.appState.mapGeoData) {
        await loadGeoJSON();
      }
      geojsonData = window.appState.mapGeoData;

      // 🔥 BƯỚC 1: ÉP TẢI LẠI TOÀN BỘ PROFILES TỪ SUPABASE (BỎ QUA CACHE)
      console.log('Đang ép tải danh sách nhân sự mới nhất...');
      const { data: profData, error: profErr } = await window.supabaseClient
        .from('profiles')
        .select(
          'email, full_name, team, department, ma_xa, latitude, longitude'
        );

      if (!profErr && profData) {
        // Cập nhật lại mảng companyData toàn cục với dữ liệu cực chuẩn
        companyData = profData.map((u) => ({
          ...u,
          full_name: u.full_name,
          fullName: u.full_name || u.email,
          team: u.team || u.department,
          email: u.email,
        }));
      } else {
        console.error('Không lấy được profiles:', profErr);
        companyData = window.appState.users || []; // Fallback
      }

      filteredData = [...companyData];

      // 🔥 BƯỚC 2: TẢI INCIDENTS
      const { data: incData, error: incErr } = await window.supabaseClient
        .from('incidents')
        .select(
          'id, event_name, location_text, latitude, longitude, status, activation_time, members'
        );

      if (!incErr && incData) {
        incidentData = [...incData];
      } else {
        incidentData = [];
      }

      // 🔥 BƯỚC 3: VẼ BẢN ĐỒ
      if (!map) {
        map = L.map('containerMap', {
          center: [10.77, 106.7],
          zoom: 10,
          zoomControl: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          opacity: 0.5,
        }).addTo(map);
        geojsonBaseLayer = L.geoJSON(geojsonData, {
          style: { fillColor: 'transparent', color: '#bcbcbc', weight: 1 },
          interactive: false,
        }).addTo(map);
        setupMapPlugins();
      } else {
        setTimeout(() => map.invalidateSize(), 200);
      }

      renderMap();
    } catch (error) {
      console.error('Lỗi renderMapPage:', error);
      if (typeof showToast === 'function')
        showToast('Lỗi bản đồ: ' + error.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  }

  // Hàm phụ để tách code plugin cho sạch
  function setupMapPlugins() {
    // Plugin Draw
    if (typeof L.Control.Draw !== 'undefined') {
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      const drawControl = new L.Control.Draw({
        position: 'topleft',
        draw: { circle: false, rectangle: false },
        edit: { featureGroup: drawnItems },
      });
      map.addControl(drawControl);
      map.on('draw:created', (e) => drawnItems.addLayer(e.layer));
    }

    // Plugin Print
    if (typeof L.control.browserPrint !== 'undefined') {
      L.control.browserPrint({ title: 'In bản đồ RRT' }).addTo(map);
    }
  }

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
      htmlContent = `<div class="msg-bubble" style="background:#0084ff; color:white;">${window.escapeHtml(
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
          <div class="report-bubble" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; padding: 12px 16px; max-width: 90%;">
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
              : 'background:#0084ff; color:white;';

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

  /**
   * ============================================================
   * XỬ LÝ DỮ LIỆU VÀ ĐIỀN VÀO FORM AAR (FINAL VERSION)
   * ============================================================
   */
  function processAarData(planData) {
    let summaryArr = [];
    let issueArr = [];
    let lessonArr = [];

    // ============================================================
    // PHẦN A: TỔNG HỢP SỐ LIỆU
    // ============================================================
    const HEADER_STATS = '📊 SỐ LIỆU GHI NHẬN';
    let finalStats = { cases: 0, suspected: 0, deaths: 0, source: '' };
    let hasData = false;

    // 1. Ưu tiên dữ liệu từ IAP
    if (
      planData &&
      planData.stats &&
      (planData.stats.casesTotal > 0 ||
        planData.stats.deathsTotal > 0 ||
        planData.stats.suspectedTotal > 0)
    ) {
      finalStats.cases = planData.stats.casesTotal;
      finalStats.suspected = planData.stats.suspectedTotal;
      finalStats.deaths = planData.stats.deathsTotal;
      finalStats.source = '(Nguồn: Dữ liệu Phương án IAP)';
      hasData = true;
    }
    // 2. Fallback: Quét từ Log Chat
    else if (
      window.currentIncidentLogs &&
      window.currentIncidentLogs.length > 0
    ) {
      let maxTime = '';
      window.currentIncidentLogs.forEach((r) => {
        const content = r.content;
        const c = content.match(/(?:Số mắc|Mắc|Ca mắc|F0)[:\s]*(\d+)/i);
        const s = content.match(/(?:Nghi ngờ|Ca nghi ngờ|F1)[:\s]*(\d+)/i);
        const d = content.match(/(?:Tử vong|TV|Ca tử vong)[:\s]*(\d+)/i);

        if (c || s || d) {
          hasData = true;
          maxTime = r.timestamp;
          if (c) finalStats.cases = Math.max(finalStats.cases, parseInt(c[1]));
          if (s)
            finalStats.suspected = Math.max(
              finalStats.suspected,
              parseInt(s[1])
            );
          if (d)
            finalStats.deaths = Math.max(finalStats.deaths, parseInt(d[1]));
        }

        if (r.type === 'SOS') {
          let cleanText = content
            .replace(/<[^>]*>/g, '')
            .replace(/YÊU CẦU HỖ TRỢ \(SOS\)/gi, '')
            .replace(/Chi tiết:/gi, '')
            .trim();
          if (!issueArr.some((i) => i.includes(cleanText))) {
            issueArr.push(`⚠️ [SOS ${r.timestamp}] ${cleanText}`);
          }
        }
      });
      if (hasData)
        finalStats.source = `(Theo ghi nhận log chat lúc ${maxTime})`;
    }

    if (hasData) {
      summaryArr.push(HEADER_STATS);
      summaryArr.push(`- Số mắc: ${finalStats.cases}`);
      summaryArr.push(`- Nghi ngờ: ${finalStats.suspected}`);
      summaryArr.push(`- Tử vong: ${finalStats.deaths}`);
      summaryArr.push(finalStats.source);
      summaryArr.push('--------------------------------');
    }

    // ============================================================
    // PHẦN B: TỔNG HỢP DIỄN TIẾN (LỊCH SỬ THÔNG MINH)
    // ============================================================
    if (
      planData &&
      planData.assessmentHistory &&
      planData.assessmentHistory.length > 0
    ) {
      summaryArr.push('📝 TÓM TẮT DIỄN TIẾN SỰ KIỆN');

      // Sắp xếp: Cũ -> Mới
      const history = [...planData.assessmentHistory].sort(
        (a, b) => parseVNDate(a.timestamp) - parseVNDate(b.timestamp)
      );

      let lastContentSignature = '';

      history.forEach((h, index) => {
        // Tạo chữ ký để so sánh trùng lặp
        const currentSig = `${h.causes?.trim()}|${h.clinical_char?.trim()}|${h.context?.trim()}`;

        // Chỉ in nếu nội dung thay đổi hoặc là dòng đầu/cuối
        if (
          index === 0 ||
          index === history.length - 1 ||
          currentSig !== lastContentSignature
        ) {
          // [FIX] Thêm giá trị mặc định nếu không có tên author
          const authorName = h.author ? h.author : 'Không xác định';

          summaryArr.push(
            `\n📅 Giai đoạn: ${h.timestamp} (Đánh giá bởi: ${authorName})`
          );

          // 1. Nguyên nhân
          if (h.causes && h.causes.length > 2)
            summaryArr.push(`- Nguyên nhân (Tác nhân/Nguồn lây): ${h.causes}`);

          // 2. Lâm sàng
          if (h.clinical_char && h.clinical_char.length > 2) {
            const label = '- Đặc tính lâm sàng/dịch tễ: ';
            if (h.clinical_char.length > 100) {
              summaryArr.push(
                `${label}\n  ${h.clinical_char.replace(/\n/g, '\n  ')}`
              );
            } else {
              summaryArr.push(`${label}${h.clinical_char}`);
            }
          }

          // 3. Bối cảnh
          if (h.context && h.context.length > 2) {
            const label = '- Bối cảnh & Yếu tố nguy cơ: ';
            if (h.context.length > 100) {
              summaryArr.push(
                `${label}\n  ${h.context.replace(/\n/g, '\n  ')}`
              );
            } else {
              summaryArr.push(`${label}${h.context}`);
            }
          }

          lastContentSignature = currentSig;
        }
      });
    } else if (planData && planData.assessment) {
      // Fallback: Nếu không có lịch sử, lấy cái mới nhất (Đã format đẹp)
      summaryArr.push('📝 ĐÁNH GIÁ HIỆN TẠI');
      const a = planData.assessment;

      // Nguyên nhân
      summaryArr.push(`- Nguyên nhân: ${a.causes || 'Đang điều tra'}`);

      // Lâm sàng
      if (a.clinical_char && a.clinical_char.length > 100) {
        summaryArr.push(
          `- Đặc tính lâm sàng/dịch tễ:\n  ${a.clinical_char.replace(
            /\n/g,
            '\n  '
          )}`
        );
      } else {
        summaryArr.push(
          `- Đặc tính lâm sàng/dịch tễ: ${a.clinical_char || 'Đang điều tra'}`
        );
      }

      // Bối cảnh
      if (a.context && a.context.length > 100) {
        summaryArr.push(
          `- Bối cảnh & Yếu tố nguy cơ:\n  ${a.context.replace(/\n/g, '\n  ')}`
        );
      } else {
        summaryArr.push(`- Bối cảnh & Yếu tố nguy cơ: ${a.context || ''}`);
      }
    }

    // ============================================================
    // PHẦN C: HOẠT ĐỘNG (GIỮ NGUYÊN)
    // ============================================================
    if (
      planData &&
      planData.assessment &&
      planData.assessment.activitiesByObjective
    ) {
      summaryArr.push('\n🚀 KẾT QUẢ HOẠT ĐỘNG ĐÁP ỨNG');
      summaryArr.push(planData.assessment.activitiesByObjective);
    } else if (planData && planData.activities) {
      const doneTasks = planData.activities.filter((t) => t.status === 'Done');
      if (doneTasks.length > 0) {
        summaryArr.push('\n🚀 KẾT QUẢ HOẠT ĐỘNG');
        doneTasks.forEach((t) => summaryArr.push(`✅ ${t.content}`));
      }
    }

    // ============================================================
    // PHẦN D: SOS TỪ SERVER
    // ============================================================
    if (planData && planData.sosList && planData.sosList.length > 0) {
      planData.sosList.forEach((sosItem) => {
        if (!issueArr.includes(sosItem)) issueArr.push(sosItem);
      });
    }

    // ============================================================
    // PHẦN E: ĐIỀN FORM
    // ============================================================
    if (summaryArr.length === 0 && issueArr.length === 0) {
      showToast('Không tìm thấy dữ liệu để tổng hợp.', 'warning');
      return;
    }

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('aar-summary', summaryArr.join('\n'));
    setVal('aar-issues', issueArr.join('\n'));

    const currentLesson = document.getElementById('aar-lessons-learned').value;
    if (!currentLesson || currentLesson.trim() === '') {
      setVal(
        'aar-lessons-learned',
        '- Tiếp tục giám sát sau khi đóng sự kiện.\n- Cập nhật quy trình phối hợp.'
      );
    }

    showToast('Đã tổng hợp dữ liệu thành công!', 'success');
  }

  // Hàm phụ trợ (Bắt buộc phải có để Sort hoạt động)
  function parseVNDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.match(/\d+/g);
    if (!parts || parts.length < 5) return 0;
    return new Date(
      parts[4],
      parts[3] - 1,
      parts[2],
      parts[0],
      parts[1]
    ).getTime();
  }

  $(document).on('submit', '#aarForm', async function (e) {
    e.preventDefault();
    const btn = $('#btn-submit-aar');
    const originalText = btn.html();

    btn
      .prop('disabled', true)
      .html('<i class="bx bx-loader-alt bx-spin"></i> Đang lưu...');

    // 1. Thu thập dữ liệu từ Modal
    const formData = {
      incidentId: $('#aar-incident-id').val(),
      summary: $('#aar-summary').val(),
      issues: $('#aar-issues').val(),
      lessons: $('#aar-lessons-learned').val(),

      // Bắt chính xác value từ ô Select (sẽ ra 'closed' hoặc 'Active')
      status: $('#aar-status').val(),
    };

    try {
      if (!formData.incidentId)
        throw new Error('Lỗi: Không tìm thấy ID sự kiện.');

      // ==========================================
      // LƯU XUỐNG DATABASE
      // ==========================================

      // Đôi khi Database quy định chữ thường ('closed', 'active').
      // Nếu bạn chạy thử đoạn này mà vẫn dính lỗi 23514, hãy đổi dòng dưới thành:

      //const dbStatus = formData.status.toLowerCase();
      const dbStatus = formData.status;

      const { error } = await window.supabaseClient
        .from('incidents')
        .update({
          aar_data: {
            summary: formData.summary,
            issues: formData.issues,
            lessons: formData.lessons,
          },
          status: dbStatus, // Ghi đè trạng thái sự kiện
        })
        .eq('id', formData.incidentId);

      if (error) throw error;

      // Đóng Modal và thông báo
      $('#aarModal').modal('hide');
      showToast('Đã lưu Báo cáo AAR thành công!', 'success');

      // Refresh dữ liệu màn hình ngoài
      if (typeof window.pollForTrackingUpdates === 'function') {
        window.pollForTrackingUpdates();
      }

      // ==========================================
      // CẮT CHUỖI VÀ MỞ FORM SITREP (GIỮ NGUYÊN)
      // ==========================================
      // ==========================================
      // GỌI GIAO DIỆN CHUYỂN TIẾP CHUYÊN NGHIỆP
      // ==========================================
      setTimeout(() => {
        // 1. NHÀO NẶN DỮ LIỆU TỪ AAR ĐỂ TẠO GÓI PRE-FILL CHO BÁO CÁO
        const rawSummary = formData.summary || '';

        let stats = {
          casesNew: 0,
          casesTotal: 0,
          suspectedNew: 0,
          suspectedTotal: 0,
          deathsNew: 0,
          deathsTotal: 0,
        };
        const c = rawSummary.match(/(?:Mắc|Số mắc)[:\s]*(\d+)/i);
        const s = rawSummary.match(/(?:Nghi ngờ)[:\s]*(\d+)/i);
        const d = rawSummary.match(/(?:Tử vong)[:\s]*(\d+)/i);

        if (c) stats.casesTotal = parseInt(c[1]);
        if (s) stats.suspectedTotal = parseInt(s[1]);
        if (d) stats.deathsTotal = parseInt(d[1]);

        const KEY_ACTIVITY = '[KẾT QUẢ TRIỂN KHAI HOẠT ĐỘNG ĐÁP ỨNG]';
        const KEY_RESOURCE = '[NGUỒN LỰC ĐÃ HUY ĐỘNG]';

        let cleanOverview = rawSummary;
        let cleanActivities = '';

        const idxAct = rawSummary.indexOf(KEY_ACTIVITY);
        if (idxAct > -1) {
          cleanOverview = rawSummary
            .substring(0, idxAct)
            .replace('[TỔNG QUAN TÌNH HÌNH BAN ĐẦU]', '')
            .trim();
          let actSection = rawSummary.substring(idxAct + KEY_ACTIVITY.length);
          const idxRes = actSection.indexOf(KEY_RESOURCE);
          if (idxRes > -1) actSection = actSection.substring(0, idxRes);
          cleanActivities = actSection.trim();
        }

        // Đây là gói dữ liệu CHUẨN mà Modal Báo cáo (SITREP) cần:
        const preFillData = {
          stats: stats,
          summary: cleanOverview,
          activities: cleanActivities,
          detectedIncidents: formData.issues,
          issues: formData.issues
            ? 'Phát sinh các vấn đề/khó khăn (Xem mục Sự cố).'
            : '',
          lessons: formData.lessons,
          nextSteps: 'Hoàn tất đánh giá và đóng sự kiện.',
          hrChanges: 'Không có thay đổi.',
          level: 'Theo dõi',
        };

        // 2. HIỂN THỊ MODAL HỎI XÁC NHẬN
        const modalHtml = `
          <div class="modal fade" id="customConfirmModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content border-0 shadow-lg">
                <div class="modal-body text-center p-4">
                  <i class='bx bx-check-circle text-success' style='font-size: 4rem;'></i>
                  <h5 class="mt-3 fw-bold">Lưu AAR thành công!</h5>
                  <p class="text-muted">Bạn có muốn chuyển sang lập 'Báo cáo Hoàn thành' ngay bây giờ không?</p>
                  <div class="mt-4">
                      <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Để sau</button>
                      <button type="button" class="btn btn-primary" id="btn-confirm-yes">Lập báo cáo ngay</button>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
        $('body').append(modalHtml);
        const confirmModal = new bootstrap.Modal(
          document.getElementById('customConfirmModal')
        );
        confirmModal.show();

        $('#btn-confirm-yes').on('click', function () {
          confirmModal.hide();
          $('#customConfirmModal').remove();
          $('.modal-backdrop').remove();

          // 🔥 ĐÂY LÀ ĐIỂM SỬA LỖI: Gọi đúng hàm, truyền đúng 2 tham số!
          if (typeof window.openReportModal === 'function') {
            window.openReportModal('COMPLETION', preFillData);
          } else {
            showToast('Lỗi: Chưa tải hàm Modal Báo cáo.', 'error');
          }
        });
        $('#customConfirmModal').on('hidden.bs.modal', () =>
          $('#customConfirmModal').remove()
        );
      }, 800);
    } catch (err) {
      console.error('Lỗi lưu AAR:', err);
      showToast('Lỗi lưu AAR: ' + err.message, 'error');
    } finally {
      btn.prop('disabled', false).html(originalText);
    }
  });
  window.submitSOS = async function () {
    const type = document.getElementById('sos-type').value;
    const qty = document.getElementById('sos-qty').value.trim();
    const desc = document.getElementById('sos-desc').value.trim();
    const incidentId = window.currentDossierId;

    if (!qty) {
      showToast('Vui lòng nhập số lượng hoặc chi tiết.', 'warning');
      return;
    }

    const contentHtml = `
      <div class="msg-bubble" style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; width: 100%; padding: 15px;">
          <div style="display:inline-block; background: #dc3545; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
              YÊU CẦU HỖ TRỢ (SOS)
          </div>
          <div style="font-weight: bold; font-size: 14px; color: #dc3545;">${type.toUpperCase()}</div>
          <div style="margin-top: 5px;"><b>Chi tiết:</b> ${window.escapeHtml(
            qty
          )}</div>
          <div style="margin-top: 5px; font-style: italic;">"${window.escapeHtml(
            desc
          )}"</div>
      </div>
  `;

    // Render UI ngay
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `
          <div class="msg right">
              <div class="msg-sender">Tôi</div>
              ${contentHtml}
          </div>
      `
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    // Gửi vào bảng incident_logs
    try {
      // ✅ Validate incidentId trước khi insert
      if (!incidentId) {
        throw new Error('Không tìm thấy ID sự kiện');
      }

      // ✅ Escape content nếu có HTML từ user input (chống XSS)
      const safeContent =
        typeof contentHtml === 'string'
          ? contentHtml
          : String(contentHtml || '');

      const { error } = await supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: safeContent,
          log_type: 'SOS', // ✅ Đúng tên cột theo schema
          user_id: window.getCurrentUserId(), // ✅ Dùng helper lấy UUID
          attachment_url: null, // ✅ Có thể bỏ nếu luôn null
          // created_at: bỏ dòng này → DB tự sinh default
        },
      ]);

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(error.message || 'Lỗi khi lưu SOS');
      }

      // ✅ Dọn dẹp form
      const qtyInput = document.getElementById('sos-qty');
      const descInput = document.getElementById('sos-desc');
      if (qtyInput) qtyInput.value = '';
      if (descInput) descInput.value = '';

      // ✅ Đóng modal an toàn
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-sos');
      } else {
        const modal = document.getElementById('modal-sos');
        if (modal) {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
          // Xóa backdrop nếu dùng Bootstrap
          document
            .querySelectorAll('.modal-backdrop')
            .forEach((el) => el.remove());
        }
      }

      showToast('✅ Đã gửi yêu cầu hỗ trợ SOS!', 'success');
    } catch (err) {
      console.error('Lỗi gửi SOS:', err);
      showToast('Lỗi gửi SOS: ' + err.message, 'error');
    }
  };
  // ============================================================
  // LOGIC LUÂN CHUYỂN ĐỘI (NÂNG CẤP)
  // ============================================================

  // 1. Mở Modal & Tự động nhận diện Đội cũ
  window.openTeamRotationModal = function () {
    const modal = document.getElementById('modal-team-rotate');
    const oldDisplay = document.getElementById('rot-old-team-display');
    const oldValue = document.getElementById('rot-old-team-value');
    const warning = document.getElementById('rot-old-team-warning');
    const btnConfirm = document.getElementById('btn-confirm-rotate');
    const newSel = document.getElementById('rot-new-team');

    // Điền danh sách team vào dropdown (nếu chưa có)
    if (newSel.options.length <= 1) {
      let opts = '<option value="">-- Chọn đội --</option>';
      for (let i = 1; i <= 10; i++)
        opts += `<option value="Team ${i}">Team ${i}</option>`;
      newSel.innerHTML = opts;
    }

    // Lấy thông tin sự cố hiện tại
    const incidentId = window.currentDossierId;
    const incident = window.appState.trackingIncidents.find(
      (i) => i.id === incidentId
    );

    if (incident) {
      // Ưu tiên lấy từ cột Main_Team (nếu có)
      let currentTeam = incident.main_team;

      // Nếu không có Main_Team, thử đoán từ tên sự kiện hoặc danh sách thành viên (Logic đơn giản)
      if (!currentTeam || currentTeam === '') {
        // (Ở đây ta tạm thời để trống nếu không có dữ liệu Main_Team chuẩn)
        currentTeam = 'Mixed/Unknown';
      }

      oldDisplay.value = currentTeam;
      oldValue.value = currentTeam;

      // Kiểm tra hợp lệ
      if (currentTeam.startsWith('Team')) {
        // Hợp lệ
        warning.style.display = 'none';
        btnConfirm.disabled = false;
      } else {
        // Không phải Team chuẩn -> Cảnh báo dùng thay lẻ
        warning.style.display = 'block';
        btnConfirm.disabled = true; // Khóa nút thực hiện
      }
    }

    // Reset các trường khác
    document.getElementById('rot-suggestion-text').textContent = '';
    newSel.value = '';

    if (modal) modal.style.display = 'flex';
  };

  // 1. Gợi ý Đội Mới
  window.suggestNewTeam = async function () {
    const textEl = document.getElementById('rot-suggestion-text');
    textEl.innerHTML =
      '<span class="spinner-border spinner-border-sm"></span> Đang tìm đội rảnh...';

    const today = new Date().toISOString().split('T')[0];

    try {
      // Query: Lấy các đội đang làm việc hôm nay
      const { data: busyTeams, error } = await supabaseClient
        .from('roster_schedules')
        .select('team_name')
        .eq('duty_date', today);

      if (error) throw error;

      const busyTeamNames = busyTeams.map((t) => t.team_name);

      // Giả sử bạn có 1 danh sách tất cả các đội (có thể lưu trong helpers hoặc 1 biến hằng số)
      const allTeams = ['Đội A', 'Đội B', 'Đội C', 'Đội D']; // Thay bằng danh sách thực tế của bạn
      const availableTeams = allTeams.filter((t) => !busyTeamNames.includes(t));

      if (availableTeams.length > 0) {
        const bestMatch = availableTeams[0]; // Chọn đội đầu tiên rảnh
        document.getElementById('rot-new-team').value = bestMatch;
        textEl.innerHTML = `<span class="text-success"><i class='bx bx-check'></i> Đề xuất: <b>${bestMatch}</b> (Đang rảnh)</span>`;
      } else {
        textEl.innerHTML =
          '<span class="text-danger">Không tìm thấy đội nào rảnh hôm nay.</span>';
      }
    } catch (err) {
      textEl.textContent = 'Lỗi tìm kiếm.';
      console.error(err);
    }
  };

  // 2. Submit Thay thế Đội
  window.submitTeamRotation = function () {
    const oldTeam = document.getElementById('rot-old-team-value').value;
    const newTeam = document.getElementById('rot-new-team').value;
    const incidentId = window.currentDossierId;

    if (!newTeam) {
      showToast('Vui lòng chọn Đội thay thế.', 'warning');
      return;
    }
    if (oldTeam === newTeam) {
      showToast('Đội mới trùng với đội cũ.', 'warning');
      return;
    }

    showToastConfirm(
      `Xác nhận thay toàn bộ <strong>${oldTeam}</strong> bằng <strong>${newTeam}</strong>?`,
      async function () {
        showLoadingSpinner();
        try {
          // Update bảng incidents
          const { error } = await supabaseClient
            .from('incidents')
            .update({ team_name: newTeam }) // Giả sử bạn lưu team trong bảng incidents
            .eq('id', incidentId);

          if (error) throw error;

          showToast('Thay thế đội thành công!', 'success');
          if (typeof window.closeModal === 'function')
            window.closeModal('modal-team-rotate');

          // Reload toàn bộ
          if (typeof window.enterDashboard === 'function')
            await window.enterDashboard();

          // Refresh Dossier view
          if (window.currentDossierId && window.appState.incidents) {
            const updatedInc = window.appState.incidents.find(
              (i) => i.id === incidentId
            );
            if (updatedInc && typeof openDossierView === 'function') {
              openDossierView(encodeURIComponent(JSON.stringify(updatedInc)));
            }
          }
        } catch (err) {
          showToast('Lỗi: ' + err.message, 'error');
        } finally {
          hideLoadingSpinner();
        }
      }
    );
  };
  window.submitQuickReport = async function () {
    const sit = document.getElementById('qr-situation').value.trim();
    const act = document.getElementById('qr-action').value.trim();
    const req = document.getElementById('qr-request').value.trim();

    if (!sit && !act && !req) {
      showToast('Vui lòng nhập ít nhất một nội dung báo cáo.', 'warning');
      return;
    }

    let formattedContent = '';
    if (sit)
      formattedContent += `<b>1. Tình hình:</b><br>${window
        .escapeHtml(sit)
        .replace(/\n/g, '<br>')}<br><br>`;
    if (act)
      formattedContent += `<b>2. Hoạt động:</b><br>${window
        .escapeHtml(act)
        .replace(/\n/g, '<br>')}<br><br>`;
    if (req)
      formattedContent += `<b>3. Kiến nghị:</b><br>${window
        .escapeHtml(req)
        .replace(/\n/g, '<br>')}`;

    const incidentId = window.currentDossierId;
    const currentUser =
      window.userSession?.email || window.userSession?.username || 'admin';

    // RENDER UI NGAY (Optimistic UI)
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `
          <div class="msg right">
              <div class="msg-sender">Tôi</div>
              <div class="report-bubble">
                  <div class="report-header"><span><i class="bx bxs-report"></i> BÁO CÁO NHANH</span></div>
                  <div class="report-body">${formattedContent}</div>
              </div>
          </div>
      `
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // GỬI VÀO SUPABASE
    try {
      // ✅ Dùng helper lấy UUID thay vì email/text
      const currentUserId =
        window.getCurrentUserId?.() || window.userSession?.id;

      const { error } = await supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: formattedContent,
          // ✅ Sửa: type → log_type
          log_type: 'Report',
          // ✅ Sửa: user → user_id (phải là UUID)
          user_id: currentUserId,
          // ✅ Thêm attachment_url nếu có (để null nếu không)
          attachment_url: null,
          // created_at sẽ tự động sinh bởi DB default, không cần truyền
        },
      ]);

      if (error) throw error;

      // Dọn dẹp form
      document.getElementById('qr-situation').value = '';
      document.getElementById('qr-action').value = '';
      document.getElementById('qr-request').value = '';

      if (typeof window.closeModal === 'function')
        window.closeModal('modal-quick-report');
      else document.getElementById('modal-quick-report').style.display = 'none';

      showToast('✅ Đã gửi báo cáo nhanh!', 'success');
    } catch (err) {
      console.error('❌ Lỗi gửi báo cáo:', err);
      showToast('Lỗi: ' + err.message, 'error');
    }
  };
  /**
   * =======================================================================
   * MODULE: OPEN REPORT MODAL (FULL FEATURES: AI, SYNC & NEW UI)
   * =======================================================================
   */
  // Khởi tạo cache rỗng
  window.cachedPlanData = null;

  // =========================================================================
  // 1. HÀM MỞ MODAL & TẢI DỮ LIỆU
  // =========================================================================
  // ========================================================================
  // HELPER: Parse JSONB an toàn + Format data
  // ========================================================================
  function safeParseJson(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }

  function formatNumber(num) {
    const n = parseInt(num, 10);
    return isNaN(n) ? 0 : n;
  }

  function extractStatsFromContent(content) {
    if (!content) return { cases: 0, suspected: 0, deaths: 0 };
    const stats = { cases: 0, suspected: 0, deaths: 0 };

    // Regex linh hoạt cho nhiều format
    const caseMatch = content.match(
      /(?:số\s*mắc|ca\s*mắc|mắc|f0|confirmed)[:\s]*(\d+)/i
    );
    const suspectedMatch = content.match(
      /(?:nghi\s*ngờ|f1|suspected|probable)[:\s]*(\d+)/i
    );
    const deathMatch = content.match(
      /(?:tử\s*vong|chết|tv|deaths|fatalities)[:\s]*(\d+)/i
    );

    if (caseMatch) stats.cases = Math.max(stats.cases, parseInt(caseMatch[1]));
    if (suspectedMatch)
      stats.suspected = Math.max(stats.suspected, parseInt(suspectedMatch[1]));
    if (deathMatch)
      stats.deaths = Math.max(stats.deaths, parseInt(deathMatch[1]));

    return stats;
  }

  // ========================================================================
  // MAIN: OPEN REPORT MODAL - FIX CHUẨN THEO HTML
  // ========================================================================
  // ========================================================================
  // OPEN REPORT MODAL - FIX CHUẨN: FETCH → SET CACHE → SHOW → RENDER
  // ========================================================================
  window.openReportModal = async function (preSelectType, preFillData) {
    const modalId = 'modal-official-report';
    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
      console.error('❌ Modal element not found:', modalId);
      return;
    }

    console.log('🔍 Opening report modal...');

    // 1. CLEANUP MODAL CŨ
    const existing = bootstrap.Modal?.getInstance(modalEl);
    if (existing) existing.dispose();
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    modalEl.classList.remove('show', 'd-block');
    modalEl.style.display = '';
    modalEl.setAttribute('aria-hidden', 'true');

    // 2. RESET FORM
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v ?? '';
    };
    const title =
      document.getElementById('dossier-title')?.textContent?.trim() ||
      'Sự kiện chưa đặt tên';
    setVal('rpt-event-name', title);
    setVal('report-type', preSelectType || 'EMERGENCY');
    setVal('rpt-level', 'Chưa xác định');
    [
      'rpt-cases-new',
      'rpt-cases-total',
      'rpt-suspected-new',
      'rpt-suspected-total',
      'rpt-deaths-new',
      'rpt-deaths-total',
      'rpt-overview',
      'rpt-activities',
      'rpt-issues',
      'rpt-next-steps',
      'rpt-detected-incidents',
      'rpt-hr-changes',
      'rpt-lessons',
    ].forEach((id) => setVal(id, ''));

    if (typeof toggleReportFields === 'function') toggleReportFields();

    // 3. NHÁNH A: PRE-FILLED DATA (từ AAR transfer)
    if (preFillData) {
      console.log('📥 Loading with preFillData');
      window.cachedPlanData = {
        isPreFilled: true,
        source: 'aar_transfer',
        stats: preFillData.stats || {},
        summary: preFillData.summary || '',
        activitiesText: preFillData.activities || '',
        issues: preFillData.issues || '',
        detectedIncidents: preFillData.detectedIncidents || 'Không ghi nhận',
        lessons: preFillData.lessons || '',
        nextSteps: preFillData.nextSteps || 'Sự kiện đã kết thúc.',
        hrChanges: preFillData.hrChanges || 'Không thay đổi',
        level: preFillData.level || 'Theo dõi',
        sosRequests: preFillData.sosRequests || [],
      };

      // Show modal rồi render ngay (vì cache đã có sẵn)
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      // Render sau khi modal fully shown
      modalEl.addEventListener(
        'shown.bs.modal',
        () => {
          if (window.cachedPlanData) {
            window.renderReportContentFromCache(window.cachedPlanData);
          }
        },
        { once: true }
      );

      return;
    }

    // 4. NHÁNH B: FETCH TỪ DATABASE — QUAN TRỌNG: FETCH TRƯỚC KHI SHOW MODAL
    console.log('🔄 Fetching data from Supabase BEFORE showing modal...');

    try {
      const incidentId = window.currentDossierId;
      if (!incidentId) throw new Error('Missing incidentId');

      // Fetch song song tất cả bảng
      const [incRes, planRes, objRes, actRes, logRes] = await Promise.all([
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
          .from('incident_logs')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),
      ]);

      const incData = incRes.data || {};
      const planData = planRes.data?.[0] || {};
      const objectives = objRes.data || [];
      const activities = actRes.data || [];
      const logs = logRes.data || [];

      console.log('📊 Fetched:', {
        objectives: objectives.length,
        activities: activities.length,
        logs: logs.length,
      });

      // Lọc SOS chính xác
      const sosRequests = logs.filter(
        (l) => String(l.log_type || '').toLowerCase() === 'sos'
      );
      console.log('🆘 Found SOS logs:', sosRequests.length);

      // Build activities summary
      const activitiesSummary =
        objectives.length > 0
          ? objectives
              .map((obj, i) => {
                const acts = activities.filter(
                  (a) => String(a.objective_id) === String(obj.id)
                );
                return `🎯 Mục tiêu ${i + 1}: ${obj.objective_text}\n${
                  acts.map((a) => `• ${a.content}`).join('\n') ||
                  '• Chưa có chi tiết'
                }`;
              })
              .join('\n\n')
          : 'Chưa có hoạt động.';

      // Aggregate stats từ logs
      const stats = { cases: 0, suspected: 0, deaths: 0 };
      logs.forEach((l) => {
        if (l.content) {
          const c = l.content.match(/(?:mắc|f0)[:\s]*(\d+)/i);
          const s = l.content.match(/(?:nghi ngờ|f1)[:\s]*(\d+)/i);
          const d = l.content.match(/(?:tử vong|tv)[:\s]*(\d+)/i);
          if (c) stats.cases = Math.max(stats.cases, +c[1]);
          if (s) stats.suspected = Math.max(stats.suspected, +s[1]);
          if (d) stats.deaths = Math.max(stats.deaths, +d[1]);
        }
      });

      // ✅ QUAN TRỌNG: GÁN CACHE NGAY LẬP TỨC, TRƯỚC KHI SHOW MODAL
      window.cachedPlanData = {
        isPreFilled: false,
        source: 'database_fetch',
        incident: {
          id: incData.id,
          name: incData.event_name || title,
          status: incData.status,
        },
        plan: {
          level: planData.level,
          summary: planData.summary,
          assessment: safeParseJson(planData.assessment),
          meta: safeParseJson(planData.meta),
        },
        objectives,
        activities,
        activitiesSummary,
        logs,
        sosRequests,
        stats,
      };

      console.log('✅ Cache assigned BEFORE modal show:', {
        sosCount: sosRequests.length,
        objectivesCount: objectives.length,
        stats,
      });

      // 5. SHOW MODAL (sau khi cache đã ready)
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      // 6. RENDER KHI MODAL FULLY SHOWN
      modalEl.addEventListener(
        'shown.bs.modal',
        function onReady() {
          console.log(
            '✅ Modal fully shown. Cache available?:',
            !!window.cachedPlanData
          );

          if (window.cachedPlanData) {
            console.log('🎨 Calling renderReportContentFromCache...');
            window.renderReportContentFromCache(window.cachedPlanData);
          } else {
            console.error('❌ Cache still missing at render time!');
          }

          // Cleanup listener
          modalEl.removeEventListener('shown.bs.modal', onReady);
        },
        { once: true }
      );
    } catch (err) {
      console.error('❌ Error fetching data:', err);
      setVal('rpt-overview', `⚠️ Lỗi tải dữ liệu: ${err.message}`);

      // Vẫn show modal để user có thể nhập manual
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      showToast(
        'Không thể tải dữ liệu tự động. Bạn vẫn có thể nhập thủ công.',
        'warning'
      );
    }
  };

  // Helper parse JSON an toàn
  function safeParseJson(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }

  window.getCurrentUserEmail = function () {
    return window.userSession?.email || window.userSession?.username || null;
  };

  window.renderReportContentFromCache = function (cache) {
    console.log(' START RENDERING REPORT...');
    if (!cache) return console.error(' Cache is empty');

    // ✅ HELPER GHI TRỰC TIẾP VÀO DOM ( bypass mọi framework conflict )
    const forceSet = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ FORCED #${id}`);
      } else {
        console.error(`❌ MISSING #${id}`);
      }
    };

    try {
      // 1. Basic Info
      forceSet('rpt-event-name', cache.incident?.name || '');
      forceSet(
        'rpt-level',
        cache.plan?.level || cache.incident?.status || 'Chưa xác định'
      );

      // 2. Stats
      forceSet('rpt-cases-new', cache.stats?.cases ?? 0);
      forceSet('rpt-cases-total', cache.stats?.cases ?? 0);
      forceSet('rpt-suspected-new', cache.stats?.suspected ?? 0);
      forceSet('rpt-suspected-total', cache.stats?.suspected ?? 0);
      forceSet('rpt-deaths-new', cache.stats?.deaths ?? 0);
      forceSet('rpt-deaths-total', cache.stats?.deaths ?? 0);

      // 3. Overview & Activities
      const overview = [
        cache.plan?.summary ? `📋 IAP: ${cache.plan.summary}` : '',
        cache.plan?.assessment?.context
          ? ` Bối cảnh: ${cache.plan.assessment.context}`
          : '',
        cache.activitiesSummary
          ? `\n📌 Hoạt động:\n${cache.activitiesSummary}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      forceSet('rpt-overview', overview || 'Chưa có nội dung.');
      forceSet(
        'rpt-activities',
        cache.activitiesSummary || 'Chưa có hoạt động.'
      );

      // 🚨 4. SOS - FIX QUAN TRỌNG NHẤT
      const sosField = document.getElementById('rpt-detected-incidents');
      if (cache.sosRequests?.length > 0) {
        console.log(`🆘 Rendering ${cache.sosRequests.length} SOS logs...`);
        const sosText = cache.sosRequests
          .map((s, i) => {
            let txt = s.content || '';
            if (txt.includes('<')) {
              const d = document.createElement('div');
              d.innerHTML = txt;
              txt = d.textContent.trim();
            }
            return `${i + 1}. [${new Date(s.created_at).toLocaleString(
              'vi-VN'
            )}] ${s.user_email || 'Thành viên'}:\n   ${txt}`;
          })
          .join('\n\n');

        const finalSOS = `=== 🆘 YÊU CẦU HỖ TRỢ KHẨN CẤP ===\n\n${sosText}\n\n(Tổng: ${cache.sosRequests.length})`;

        // ✅ GHI TRỰC TIẾP & VERIFY
        if (sosField) {
          sosField.value = finalSOS;
          sosField.dispatchEvent(new Event('input'));
          sosField.dispatchEvent(new Event('change'));
          console.log('✅ SOS RENDERED. Length:', sosField.value.length);

          // Verify sau 50ms
          setTimeout(
            () =>
              console.log('🔍 SOS VERIFY:', sosField.value.substring(0, 50)),
            50
          );
        }
      } else {
        if (sosField) sosField.value = 'Không ghi nhận sự cố bất thường/SOS.';
      }

      // 5. Other fields
      forceSet(
        'rpt-hr-changes',
        cache.plan?.meta?.approval?.participants?.internal || 'Không thay đổi.'
      );
      forceSet('rpt-issues', 'Chưa ghi nhận khó khăn.');
      forceSet(
        'rpt-next-steps',
        cache.incident?.status === 'active'
          ? 'Tiếp tục giám sát.'
          : 'Sự kiện đã kết thúc.'
      );

      const lessonsEl = document.getElementById('section-completion');
      if (lessonsEl)
        lessonsEl.style.display = cache.plan?.meta?.cir ? 'block' : 'none';
      forceSet('rpt-lessons', cache.plan?.meta?.cir || '');

      console.log('✅ RENDER COMPLETE');
    } catch (err) {
      console.error(' RENDER CRASHED:', err);
    }
  };
  console.log('✅ OVERRIDE SUCCESSFUL! Now try opening modal again.');
  // =========================================================================
  // 2. KÍCH HOẠT RENDER LẠI KHI ĐỔI DROPDOWN LOẠI BÁO CÁO
  // =========================================================================
  window.onReportTypeChange = function () {
    if (typeof toggleReportFields === 'function') toggleReportFields();
    renderReportContentFromCache(window.cachedPlanData);
  };

  // =========================================================================
  // 3. HÀM "BỘ NÃO" RENDER GIAO DIỆN CHUẨN 3 LOẠI BÁO CÁO (HIỂN THỊ FULL HOẠT ĐỘNG)
  // =========================================================================

  window.analyzePersonnelChangesClient = async function (incidentId) {
    try {
      // Lấy log liên quan đến thay đổi nhân sự (Ví dụ: log có chứa từ khóa 'thay thế')
      const { data, error } = await supabaseClient
        .from('incident_logs')
        .select('content, created_at')
        .eq('incident_id', incidentId)
        .or('content.ilike.%thay thế%,content.ilike.%đổi nhân sự%')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) return 'Không có thay đổi nhân sự.';

      return data
        .map(
          (log) =>
            `[${new Date(log.created_at).toLocaleTimeString()}] ${log.content}`
        )
        .join('\n');
    } catch (err) {
      console.error('Lỗi phân tích HR:', err);
      return 'Lỗi khi tải thông tin nhân sự.';
    }
  };

  // ========================================================================
  // SUBMIT OFFICIAL REPORT - FULL VERSION
  // ========================================================================
  window.submitOfficialReport = async function () {
    // 1. VALIDATE CƠ BẢN
    if (!window.currentDossierId) {
      showToast('Lỗi: Không xác định được sự kiện.', 'error');
      return;
    }

    // 2. UI LOADING STATE
    const btn =
      document.getElementById('btn-save-report') ||
      document.querySelector('#modal-official-report .btn-primary');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Đang xử lý...';

    try {
      // 3. HELPER: Lấy giá trị input an toàn
      const getNum = (id) => {
        const el = document.getElementById(id);
        const val = el?.value?.trim();
        const num = parseInt(val, 10);
        return isNaN(num) ? 0 : num;
      };

      const getStr = (id) => document.getElementById(id)?.value?.trim() || '';

      // 4. BUILD PAYLOAD - ĐÚNG SCHEMA incident_reports
      const reportData = {
        incident_id: window.currentDossierId,

        // Text fields
        report_type: getStr('report-type'),
        level: getStr('rpt-level'),
        event_name: getStr('rpt-event-name'),
        overview: getStr('rpt-overview'),
        activities: getStr('rpt-activities'),
        issues: getStr('rpt-issues'),
        next_steps: getStr('rpt-next-steps'),
        hr_changes: getStr('rpt-hr-changes'),
        lessons: getStr('rpt-lessons'),
        detected_incidents: getStr('rpt-detected-incidents'),
        reporter:
          window.userSession?.email ||
          window.userSession?.username ||
          'Unknown',

        // ✅ Integer fields - Ép kiểu an toàn
        cases_new: getNum('rpt-cases-new'),
        suspected_new: getNum('rpt-suspected-new'),
        deaths_new: getNum('rpt-deaths-new'),
        cases_total: getNum('rpt-cases-total'),
        suspected_total: getNum('rpt-suspected-total'),
        deaths_total: getNum('rpt-deaths-total'),

        // ✅ Auto timestamp
        created_at: new Date().toISOString(),
      };

      console.log('📦 Report payload:', reportData);

      // 5. INSERT VÀO incident_reports
      const { data: inserted, error } = await window.supabaseClient
        .from('incident_reports')
        .insert([reportData])
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(error.message || 'Lỗi khi lưu báo cáo');
      }

      console.log('✅ Report saved:', inserted?.id);

      // 6. SUCCESS FEEDBACK
      showToast('✅ Đã lưu báo cáo vào hệ thống thành công!', 'success');

      // Đóng modal báo cáo
      const reportModalEl = document.getElementById('modal-official-report');
      if (reportModalEl) {
        const modalInstance = bootstrap.Modal.getInstance(reportModalEl);
        if (modalInstance) modalInstance.hide();
        else reportModalEl.style.display = 'none';
      }

      // 7. ✅ TẠO LOG ENTRY để báo cáo hiện trong chat
      const logEntry = {
        incident_id: window.currentDossierId,
        log_type: reportData.report_type || 'Report',
        content:
          `📊 **BÁO CÁO: ${reportData.report_type || 'Chính thức'}**\n` +
          `**Cấp độ:** ${reportData.level || 'N/A'}\n` +
          `**Tóm tắt:** ${
            reportData.overview?.substring(0, 100) || 'Không có tóm tắt'
          }${reportData.overview?.length > 100 ? '...' : ''}`,
        user_id: window.userSession?.id || null,
        attachment_url: null, // Sẽ update nếu export PDF
        created_at: new Date().toISOString(),
      };

      const { error: logError } = await window.supabaseClient
        .from('incident_logs')
        .insert([logEntry]);

      if (logError) {
        console.warn('⚠️ Không tạo được log entry:', logError.message);
      }

      // 8. RELOAD CHAT để hiển thị báo cáo vừa lưu
      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(window.currentDossierId);
      }

      // 9. ✅ SHOW STATS POPUP + EXPORT CONFIRM (Sau delay nhỏ để UX mượt)
      setTimeout(() => {
        const statsSummary = {
          reportType: reportData.report_type,
          casesNew: reportData.cases_new,
          casesTotal: reportData.cases_total,
          suspectedNew: reportData.suspected_new,
          suspectedTotal: reportData.suspected_total,
          deathsNew: reportData.deaths_new,
          deathsTotal: reportData.deaths_total,
          level: reportData.level,
          eventName: reportData.event_name,
        };

        showReportSuccessModal(statsSummary, null, inserted?.id);
      }, 500);
    } catch (err) {
      console.error('❌ Lỗi lưu báo cáo:', err);
      showToast(
        'Lỗi lưu báo cáo: ' + (err.message || 'Không xác định'),
        'error'
      );
    } finally {
      // 10. RESTORE BUTTON STATE
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  };

  // ========================================================================
  // HELPER: Modal hiển thị Stats + Export Confirm
  // ========================================================================
  function showReportSuccessModal(stats, fileUrl = null, reportId = null) {
    // Xóa modal cũ nếu tồn tại (tránh duplicate)
    const oldModal = document.getElementById('reportSuccessModal');
    if (oldModal) oldModal.remove();

    // Build stats HTML
    const statsHtml = `
    <div class="card bg-light border-0 mb-3">
      <div class="card-header fw-bold bg-white d-flex align-items-center">
        <i class='bx bx-stats me-2 text-primary'></i> 📊 Số liệu báo cáo
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-4 text-center">
            <small class="text-muted d-block">Ca mắc</small>
            <div class="fw-bold text-primary fs-5">${stats.casesNew} <span class="text-muted fs-6">/ ${stats.casesTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
          <div class="col-4 text-center">
            <small class="text-muted d-block">Nghi ngờ</small>
            <div class="fw-bold text-warning fs-5">${stats.suspectedNew} <span class="text-muted fs-6">/ ${stats.suspectedTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
          <div class="col-4 text-center">
            <small class="text-muted d-block">Tử vong</small>
            <div class="fw-bold text-danger fs-5">${stats.deathsNew} <span class="text-muted fs-6">/ ${stats.deathsTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
        </div>
      </div>
    </div>
  `;

    // Build action buttons
    const hasFile = fileUrl && fileUrl.trim();
    const actionButtons = `
    <div class="d-grid gap-2">
      ${
        hasFile
          ? `
        <a href="${fileUrl}" target="_blank" class="btn btn-primary">
          <i class='bx bxs-file-pdf'></i> Mở file báo cáo
        </a>
      `
          : `
        <button type="button" class="btn btn-outline-primary" id="btn-export-now">
          <i class='bx bx-export'></i> Xuất file PDF ngay
        </button>
      `
      }
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Đóng</button>
    </div>
  `;

    // Tạo modal HTML
    const modalHtml = `
    <div class="modal fade" id="reportSuccessModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title fw-bold">
              <i class='bx bx-check-circle me-2'></i> Lưu báo cáo thành công!
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">
              Báo cáo <strong class="text-primary">${
                stats.reportType || 'Chính thức'
              }</strong> 
              ${stats.eventName ? `cho sự kiện "${stats.eventName}"` : ''} 
              đã được lưu vào hệ thống.
            </p>
            
            ${statsHtml}
            ${actionButtons}
          </div>
        </div>
      </div>
    </div>
  `;

    // Append vào body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modalEl = document.getElementById('reportSuccessModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Handle "Xuất file PDF ngay" click
    document
      .getElementById('btn-export-now')
      ?.addEventListener('click', async function () {
        // Disable button tránh click nhiều lần
        this.disabled = true;
        this.innerHTML =
          '<i class="bx bx-loader-alt bx-spin"></i> Đang xuất...';

        try {
          // Gọi hàm export (truyền reportId để lấy data chính xác)
          if (typeof window.exportOfficialReport === 'function') {
            const exportedUrl = await window.exportOfficialReport(reportId);

            if (exportedUrl) {
              // Update modal với link file mới
              modal.hide();
              modalEl.addEventListener(
                'hidden.bs.modal',
                function cleanup() {
                  showReportSuccessModal(stats, exportedUrl, reportId);
                  modalEl.removeEventListener('hidden.bs.modal', cleanup);
                },
                { once: true }
              );
            }
          } else {
            showToast('⚠️ Chức năng xuất file chưa sẵn sàng!', 'warning');
          }
        } catch (err) {
          console.error('Lỗi export:', err);
          showToast('Lỗi xuất file: ' + err.message, 'error');
        } finally {
          // Restore button
          this.disabled = false;
          this.innerHTML = '<i class="bx bx-export"></i> Xuất file PDF ngay';
        }
      });

    // Cleanup khi modal đóng
    modalEl.addEventListener(
      'hidden.bs.modal',
      function () {
        setTimeout(() => {
          modalEl.remove();
          document
            .querySelectorAll('.modal-backdrop')
            .forEach((el) => el.remove());
        }, 100);
      },
      { once: true }
    );
  }

  // ========================================================================
  // HELPER: Hiển thị Modal xác nhận xuất file
  // ========================================================================
  function showExportConfirmModal() {
    // Xóa modal cũ nếu tồn tại (tránh duplicate)
    const oldModal = document.getElementById('exportConfirmModal');
    if (oldModal) oldModal.remove();

    // Tạo modal HTML
    const modalHtml = `
    <div class="modal fade" id="exportConfirmModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-body text-center p-4">
            <i class='bx bxs-file-pdf text-danger' style='font-size: 4rem;'></i>
            <h5 class="mt-3 fw-bold">Lưu báo cáo thành công!</h5>
            <p class="text-muted mb-4">Bạn có muốn xuất báo cáo này ra file định dạng chuẩn (Google Docs/PDF) không?</p>
            <div class="d-flex justify-content-center gap-2">
              <button type="button" class="btn btn-light px-4" data-bs-dismiss="modal">Để sau</button>
              <button type="button" class="btn btn-danger px-4" id="btn-confirm-export">
                <i class='bx bx-export'></i> Xuất file ngay
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

    // Append vào body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const exportModalEl = document.getElementById('exportConfirmModal');
    const exportModal = new bootstrap.Modal(exportModalEl);
    exportModal.show();

    // Handle click "Xuất file ngay"
    document
      .getElementById('btn-confirm-export')
      ?.addEventListener('click', function () {
        exportModal.hide();

        // Cleanup sau khi modal đóng hoàn toàn
        exportModalEl.addEventListener(
          'hidden.bs.modal',
          function cleanup() {
            exportModalEl.remove();
            // Xóa backdrop nếu còn sót
            document
              .querySelectorAll('.modal-backdrop')
              .forEach((el) => el.remove());
            exportModalEl.removeEventListener('hidden.bs.modal', cleanup);
          },
          { once: true }
        );

        // Gọi hàm xuất file
        if (typeof window.exportOfficialReport === 'function') {
          window.exportOfficialReport();
        } else {
          showToast('⚠️ Chức năng xuất file chưa sẵn sàng!', 'warning');
        }
      });

    // Cleanup khi modal đóng (dù bằng cách nào)
    exportModalEl.addEventListener(
      'hidden.bs.modal',
      function () {
        setTimeout(() => {
          exportModalEl.remove();
          document
            .querySelectorAll('.modal-backdrop')
            .forEach((el) => el.remove());
        }, 100);
      },
      { once: true }
    );
  }

  // ========================================================================
  // EXPORT OFFICIAL REPORT - FULL VERSION (PDF + Chat Integration)
  // ========================================================================
  window.exportOfficialReport = async function (reportId = null) {
    const incidentId = window.currentDossierId;
    const reportType = $('#report-type').val()?.trim() || 'DAILY'; // DAILY, EMERGENCY, COMPLETION

    if (!incidentId)
      return showToast('Lỗi: Không tìm thấy ID sự kiện.', 'error');

    showLoadingSpinner();

    try {
      // ==============================================================
      // 1. FETCH DỮ LIỆU TỪ SUPABASE
      // ==============================================================
      const [incRes, planRes, reportRes] = await Promise.all([
        // Incident chính
        window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .maybeSingle(),

        // Incident plan (lấy bản mới nhất)
        window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1),

        // Official report (nếu có reportId)
        reportId
          ? window.supabaseClient
              .from('incident_reports')
              .select('*')
              .eq('id', reportId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const incData = incRes.data || {};
      const planData = planRes.data?.[0] || {};
      const reportData = reportRes.data || {};

      // ✅ Parse JSONB an toàn
      const parseJson = (val, fallback = {}) => {
        if (!val) return fallback;
        if (typeof val === 'object') return val;
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      };

      const assessment = parseJson(planData.assessment, {});
      const meta = parseJson(planData.meta, {});

      // ==============================================================
      // 2. CONFIG TEMPLATE & HELPER FUNCTIONS
      // ==============================================================
      const TEMPLATES = {
        DAILY: '1DfPyiAVAd5ZmuKw7Nf62EtE3zDWLGL70KNi2h51BERs',
        EMERGENCY: '1oMRtL8cSNm6ak7wNsfU2NOKH5LbmW3aOifDGkrmTTyk',
        COMPLETION: '1QQbFqLziRiyQQqaP-Mmuvdd2JN1n1RH3lE-6EsmbtjE',
      };
      const templateId = TEMPLATES[reportType] || TEMPLATES.DAILY;

      // Helper: Format datetime VN
      const toVNDateTime = (dateStr) => {
        if (!dateStr) return 'Chưa cập nhật';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Chưa cập nhật';
        return `${d.getHours().toString().padStart(2, '0')}:${d
          .getMinutes()
          .toString()
          .padStart(2, '0')} ngày ${d.getDate().toString().padStart(2, '0')}/${(
          d.getMonth() + 1
        )
          .toString()
          .padStart(2, '0')}/${d.getFullYear()}`;
      };

      // Helper: Format checkbox ☑/☐
      const getCheckbox = (condition) =>
        condition ? '☑ Có    ☐ Không' : '☐ Có    ☑ Không';

      // ==============================================================
      // 3. BUILD PAYLOAD CHO GOOGLE APPS SCRIPT
      // ==============================================================

      // Lấy giá trị từ form hoặc fallback từ DB
      const getVal = (selector, fallback = '') => {
        const val = $(selector)?.val()?.trim();
        return val && val !== 'null' && val !== 'undefined' ? val : fallback;
      };

      const hrChanges = getVal('#rpt-hr-changes', reportData.hr_changes || '');
      const hasHrChange =
        hrChanges && !/không\s+(có\s+)?thay đổi/i.test(hrChanges.toLowerCase());

      const payload = {
        templateId: templateId,
        fileName: `[${reportType}]_${
          incData.event_name || incidentId
        }_${Date.now()}`,
        replacements: {
          // === HEADER ===
          '{{VERSION}}': '01',
          '{{NGAY_BAO_CAO}}': toVNDateTime(new Date()),
          '{{TEN_SU_KIEN}}':
            getVal('#rpt-event-name', incData.event_name) || 'Chưa có tên',
          '{{CAP_DO}}': getVal('#rpt-level', planData.level) || 'Chưa xác định',

          // === INCIDENT INFO (từ DB) ===
          '{{DIA_DIEM}}': incData.location_text || 'Chưa cập nhật địa điểm',
          '{{MA_XA}}': incData.ma_xa || '',
          '{{NGUON_TIN}}': 'Hệ thống Quản lý Giám sát RRT - HCDC',
          '{{THOI_DIEM_SU_CO}}': toVNDateTime(
            incData.activation_time || incData.created_at
          ),
          '{{NGUYEN_NHAN}}': assessment.causes || 'Đang điều tra xác minh',

          // === CLINICAL (fix typo {{LAM_SAN}} → {{LAM_SANG}}) ===
          '{{LAM_SAN}}':
            assessment.clinical_char ||
            assessment.clinical ||
            'Chưa ghi nhận đặc tính',
          '{{LAM_SANG}}':
            assessment.clinical_char ||
            assessment.clinical ||
            'Chưa ghi nhận đặc tính',

          '{{BOI_CANH}}':
            assessment.context || planData.context || 'Chưa cập nhật bối cảnh',
          '{{DU_BAO}}': assessment.forecast || 'Tiếp tục theo dõi diễn tiến',

          // === CHECKBOXES ===
          '{{CHECK_NHAN_SU}}': getCheckbox(hasHrChange),
          '{{CHECK_KET_THUC}}': getCheckbox(reportType === 'COMPLETION'),

          // === CONTACT INFO ===
          '{{CHUC_VU}}':
            window.userSession?.position ||
            meta.approval?.approverTitle ||
            'Cán bộ RRT',
          '{{TEN_NGUOI_BC}}':
            window.userSession?.full_name ||
            window.userSession?.username ||
            'Cán bộ HCDC',
          '{{EMAIL}}': window.userSession?.email || '',
          '{{SDT}}':
            window.userSession?.phone ||
            meta.coordination?.channel ||
            'Chưa cập nhật',
          '{{DOI_PHOI_HOP}}':
            meta.coordination?.partners || 'Đội Đáp ứng nhanh (RRT) HCDC',
          '{{CO_QUAN}}': 'Trung tâm Kiểm soát Bệnh tật TP.HCM (HCDC)',

          // === EPIDEMIOLOGY STATS (Integer fields) ===
          '{{MAC_MOI}}':
            getVal('#rpt-cases-new', reportData.cases_new?.toString()) || '0',
          '{{MAC_TONG}}':
            getVal('#rpt-cases-total', reportData.cases_total?.toString()) ||
            '0',
          '{{NGHI_MOI}}':
            getVal(
              '#rpt-suspected-new',
              reportData.suspected_new?.toString()
            ) || '0',
          '{{NGHI_TONG}}':
            getVal(
              '#rpt-suspected-total',
              reportData.suspected_total?.toString()
            ) || '0',
          '{{TV_MOI}}':
            getVal('#rpt-deaths-new', reportData.deaths_new?.toString()) || '0',
          '{{TV_TONG}}':
            getVal('#rpt-deaths-total', reportData.deaths_total?.toString()) ||
            '0',

          // === CONTENT SECTIONS ===
          '{{TONG_QUAN}}':
            getVal('#rpt-overview', reportData.overview) || 'Không có nội dung',
          '{{HOAT_DONG}}':
            getVal('#rpt-activities', reportData.activities) ||
            'Không có nội dung',
          '{{KHO_KHAN}}':
            getVal('#rpt-issues', reportData.issues) || 'Chưa ghi nhận',
          '{{DE_XUAT}}':
            getVal('#rpt-next-steps', reportData.next_steps) ||
            'Tiếp tục theo dõi',
          '{{SU_CO_PHAT_HIEN}}':
            getVal('#rpt-detected-incidents', reportData.detected_incidents) ||
            'Không có',
          '{{NHAN_SU}}': hrChanges || 'Không có thay đổi nhân sự',
          '{{BAI_HOC}}':
            getVal('#rpt-lessons', reportData.lessons) || 'Chưa cập nhật',
        },
      };

      console.log('📦 Export payload:', {
        templateId,
        fileName: payload.fileName,
      });

      // ==============================================================
      // 4. CALL GOOGLE APPS SCRIPT API
      // ==============================================================
      const GAS_API_URL =
        'https://script.google.com/macros/s/AKfycbwA-tfQX4wNbbUlb5AwHO3eCUF7tbCKF4QN_TxyDN9dRAYryw8My1DUZhjbWVHtX_u1/exec';

      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      const res = await response.json();
      console.log('🖨️ GAS response:', res);

      hideLoadingSpinner();

      if (res.success && res.docsUrl) {
        // ✅ Mở file trong tab mới
        window.open(res.docsUrl, '_blank');
        showToast(`🎉 Đã xuất báo cáo ${reportType} thành công!`, 'success');

        // ✅ QUAN TRỌNG: Update incident_logs với file URL để hiện trong chat
        await updateReportLogWithFile(incidentId, reportType, res.docsUrl);

        return res.docsUrl;
      } else {
        throw new Error(res.message || 'Xưởng in trả về lỗi không xác định');
      }
    } catch (err) {
      console.error('❌ Lỗi export report:', err);
      hideLoadingSpinner();
      showToast('Lỗi xuất báo cáo: ' + err.message, 'error');
      return null;
    }
  };

  // ========================================================================
  // HELPER: Update incident_logs với file URL sau khi export thành công
  // ========================================================================
  async function updateReportLogWithFile(incidentId, reportType, fileUrl) {
    try {
      // Tìm log entry gần nhất có log_type = reportType
      const { data: existingLog } = await window.supabaseClient
        .from('incident_logs')
        .select('id')
        .eq('incident_id', incidentId)
        .eq('log_type', reportType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLog?.id) {
        // Update attachment_url cho log existing
        await window.supabaseClient
          .from('incident_logs')
          .update({ attachment_url: fileUrl })
          .eq('id', existingLog.id);
        console.log('✅ Updated log with file URL:', existingLog.id);
      } else {
        // Tạo log entry mới nếu chưa có
        await window.supabaseClient.from('incident_logs').insert([
          {
            incident_id: incidentId,
            log_type: reportType,
            content: `📄 Báo cáo ${reportType} đã được xuất thành công`,
            user_id: window.userSession?.id || null,
            attachment_url: fileUrl,
            created_at: new Date().toISOString(),
          },
        ]);
        console.log('✅ Created new log with file URL');
      }

      // Reload chat để hiển thị link download
      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(incidentId);
      }
    } catch (err) {
      console.warn('⚠️ Could not update log with file URL:', err.message);
      // Không throw error để không block UX chính
    }
  }

  // ============================================================
  // HÀM TOGGLE FIELDS (VIẾT LẠI JS THUẦN - FIX LỖI ILLEGAL INVOCATION)
  // ============================================================
  window.toggleReportFields = function () {
    // Dùng document.getElementById thay cho $
    const el = document.getElementById('report-type');
    if (!el) return; // An toàn nếu chưa load form

    const type = el.value;
    const section = document.getElementById('section-completion');

    if (section) {
      if (type === 'COMPLETION') {
        section.style.display = 'block'; // Hiện
      } else {
        section.style.display = 'none'; // Ẩn
      }
    }
  };
});
// Biến toàn cục lưu vị trí để dùng lại (Cache)
let cachedLocation = null;
function getUserLocation(callback) {
  // 1. Nếu đã có vị trí lưu tạm trong phiên làm việc này -> Dùng luôn cho nhanh
  if (cachedLocation) {
    console.log('📍 Sử dụng vị trí từ bộ nhớ đệm (Cache)');
    callback(cachedLocation);
    return;
  }

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Lưu lại để lần sau không phải hỏi lại
        cachedLocation = { lat, lng };

        callback(cachedLocation);
      },
      (error) => {
        let msg = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Người dùng từ chối cấp quyền.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Không định vị được.';
            break;
          case error.TIMEOUT:
            msg = 'Hết thời gian chờ (Timeout).';
            break;
          default:
            msg = error.message;
        }
        console.warn('⚠️ Lỗi lấy vị trí: ' + msg);

        // Trả về null để app vẫn chạy tiếp, không bị chết
        callback({ lat: null, lng: null });
      },
      {
        // 🔥 CẤU HÌNH TỐI ƯU TỐC ĐỘ 🔥
        enableHighAccuracy: false, // FALSE: Dùng Wifi/4G (Nhanh) | TRUE: Dùng GPS (Chậm)
        timeout: 3000, // Chỉ đợi tối đa 3 giây
        maximumAge: 300000, // Chấp nhận vị trí cũ trong vòng 5 phút (5 * 60 * 1000)
      }
    );
  } else {
    console.log('Trình duyệt không hỗ trợ Geolocation.');
    callback({ lat: null, lng: null });
  }
}

// --- BIẾN TOÀN CỤC ---
let currentIAPMembers = []; // Danh sách nhân sự (nếu cần dùng cho dropdown)
let objectiveCounter = 0; // Bộ đếm để tạo ID tạm cho các mục tiêu

// ========================================================================
// 1. MỞ MODAL & LOAD DỮ LIỆU IAP (LUÔN CẬP NHẬT VERSION MỚI NHẤT)
// ========================================================================

window.openIAPModal = async function (incidentId) {
  showLoadingSpinner();
  $('#iapTabs button:first').tab('show');
  $('#iap-activities-body').empty();
  $('#iap-logistics-body').empty();
  $('#iap-objectives-container').empty();

  try {
    const [incRes, planRes, assessRes, objRes, actRes, logRes] =
      await Promise.all([
        window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .single(),
        window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1),
        window.supabaseClient
          .from('incident_assessments')
          .select('*')
          .eq('incident_id', incidentId)
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

    const incData = incRes?.data || {};
    const planData = Array.isArray(planRes?.data)
      ? planRes.data[0] || {}
      : planRes?.data || {};
    const assessData = Array.isArray(assessRes?.data)
      ? assessRes.data[0] || {}
      : assessRes?.data || {};

    // Bắt mảng an toàn
    const objectivesData = Array.isArray(objRes?.data) ? objRes.data : [];
    const activitiesData = Array.isArray(actRes?.data) ? actRes.data : [];
    const logisticsData = Array.isArray(logRes?.data) ? logRes.data : [];

    let currentMeta = {};
    try {
      const rawMeta = planData?.meta;
      if (typeof rawMeta === 'string') currentMeta = JSON.parse(rawMeta);
      else if (rawMeta) currentMeta = rawMeta;
    } catch (e) {
      console.warn('Meta trống hoặc lỗi, dùng mặc định.');
    }

    const currentApproval = currentMeta?.approval || {};
    const nextVersion = (parseInt(currentApproval?.version) || 0) + 1;

    // GOM SẴN HOẠT ĐỘNG VÀO TRONG MỤC TIÊU
    let structuredObjectives = [];
    if (objectivesData.length > 0) {
      structuredObjectives = objectivesData.map((obj, index) => {
        let childActs = activitiesData.filter(
          (a) => String(a.objective_id) === String(obj.id)
        );

        // Gom rác (những activity mất ID) vào mục tiêu đầu tiên
        if (index === 0) {
          const lostActs = activitiesData.filter(
            (a) => !a.objective_id || String(a.objective_id) === 'null'
          );
          childActs = [...childActs, ...lostActs];
        }

        return {
          id: obj.id,
          content: obj.objective_text,
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
    }

    const formData = {
      incident: {
        id: incidentId,
        name: incData?.event_name || 'Chưa có tên',
        level: planData?.level || 'Đáp ứng',
        summary: planData?.summary || '',
      },
      assessment: assessData,
      meta: currentMeta,
      objectives: structuredObjectives, // Đã đóng gói đẹp đẽ
      logistics: logisticsData,
    };

    populateIAPForm(formData);
    $('#iap-version').val(nextVersion);
    $('#modal-incident-plan').modal('show');
  } catch (err) {
    console.error('Lỗi tải IAP:', err);
    showToast('Không thể tải dữ liệu IAP: ' + err.message, 'error');
  } finally {
    hideLoadingSpinner();
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
                    <button class="btn btn-sm btn-success text-nowrap" onclick="addActivityRowToObj('${id}')">
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

    const { data: planResult, error: planErr } = await window.supabaseClient
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

    const { data: assessResult, error: assessErr } = await window.supabaseClient
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

// ==========================================
// HÀM KHỞI TẠO VÀ ĐỔ DỮ LIỆU DROPDOWN CHUNG (ĐÃ SỬA LỖI)
// ==========================================
function populateDropdown(
  elementId,
  dataArray,
  lastValueVarName,
  needsUniqueAndSort = false
) {
  const selectEl = $(`#${elementId}`);
  if (!selectEl.length) return;

  selectEl.empty().append('<option value="">Chọn</option>');

  if (!Array.isArray(dataArray) || dataArray.length === 0) return;

  let finalData = dataArray.filter(
    (v) => v !== null && v !== undefined && v.toString().trim() !== ''
  );

  if (needsUniqueAndSort) {
    // Lọc trùng lặp và sắp xếp theo bảng chữ cái tiếng Việt
    finalData = [...new Set(finalData)].sort((a, b) =>
      a.toString().localeCompare(b.toString(), 'vi', { sensitivity: 'base' })
    );
  }

  finalData.forEach((item) => {
    selectEl.append(new Option(item, item));
  });

  // Khôi phục giá trị cũ (nếu đang ở chế độ Edit Form)
  if (window[lastValueVarName]) {
    selectEl.val(window[lastValueVarName]).trigger('change.select2');
  }
}

// ==========================================
// HÀM TẠO DANH SÁCH DROPDOWN TỪ SUPABASE
// ==========================================
window.createWardDropdown = async function () {
  console.log('🔄 Bắt đầu tạo danh sách Dropdown từ Supabase...');

  try {
    // 1. KÉO TOÀN BỘ BẢNG DANH MỤC
    const { data: helpersData, error } = await supabaseClient
      .from('helpers')
      .select('*');

    if (error) {
      console.warn(
        'Chưa tải được bảng helpers từ Supabase, dùng dữ liệu tạm hoặc bỏ qua.',
        error.message
      );
      return;
    }

    // 2. PHÂN LOẠI DỮ LIỆU VÀO CÁC DROPDOWN (Sửa lại dựa trên ảnh bảng helpers)
    // Dựa vào ảnh bạn cung cấp, tên cột là 'name'
    const wards = helpersData
      .filter((h) => h.category === 'ward')
      .map((h) => h.name);
    const employeeStatuses = helpersData
      .filter((h) => h.category === 'employeeStatus')
      .map((h) => h.name);
    const academicList = helpersData
      .filter((h) => h.category === 'academic')
      .map((h) => h.name);
    const academicLevels = helpersData
      .filter((h) => h.category === 'academicLevel')
      .map((h) => h.name);

    // --- XỬ LÝ RIÊNG CHO PHẦN KHOA/PHÒNG (departmentAP) ---
    const departmentsData = helpersData.filter(
      (h) => h.category === 'departmentAP'
    );

    // Tạo danh sách Đơn vị công tác (parent_name)
    const units = [
      ...new Set(departmentsData.map((h) => h.parent_name).filter(Boolean)),
    ].sort();

    // Tạo map Đơn vị -> Khoa/Phòng
    const departmentMap = {};
    units.forEach((unit) => {
      departmentMap[unit] = departmentsData
        .filter((h) => h.parent_name === unit)
        .map((h) => h.name)
        .sort();
    });
    window.departmentMap = departmentMap;

    // Điền dữ liệu vào các Dropdown tĩnh
    populateDropdown('ward', wards, 'lastwardValue', true);
    populateDropdown(
      'employeeStatus',
      employeeStatuses,
      'lastemployeeStatusValue',
      true
    );
    populateDropdown('academic', academicList, 'lastacademicValue', true);
    populateDropdown(
      'academicLevel',
      academicLevels,
      'lastacademicLevelValue',
      true
    );

    // 3. XỬ LÝ DROPDOWN PHỤ THUỘC (Đơn vị -> Khoa/Phòng)
    const faxSelect = $('#fax'); // Giả sử #fax là dropdown Đơn vị công tác
    const departmentSelect = $('#department'); // Giả sử #department là dropdown Khoa/Phòng
    const employeeStatusSelect = $('#employeeStatus');

    faxSelect.empty().append('<option value="">Chọn</option>');
    departmentSelect.empty().append('<option value="">Chọn</option>');

    // Đổ dữ liệu vào dropdown Đơn vị
    units.forEach((donVi) => {
      faxSelect.append(new Option(donVi, donVi));
    });

    // Sự kiện khi Đơn vị thay đổi
    faxSelect.off('change').on('change', function () {
      const selectedDonVi = $(this).val();
      departmentSelect.empty().append('<option value="">Chọn</option>');

      if (selectedDonVi && departmentMap[selectedDonVi]) {
        departmentMap[selectedDonVi].forEach((khoaPhong) => {
          departmentSelect.append(new Option(khoaPhong, khoaPhong));
        });
      }
      departmentSelect.trigger('change.select2');
    });

    // 4. KHỞI TẠO SELECT2 CHO TẤT CẢ DROPDOWN
    if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
      $(
        '#ward, #employeeStatus, #academic, #academicLevel, #fax, #department'
      ).select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#modal-rrtForm .modal-content'),
        width: '100%',
      });

      // (Giữ nguyên các khởi tạo select2 khác của bạn)
      $('#filter-team-select').select2({
        /* ... */
      });
      $('#departmentAP').select2({
        /* ... */
      });
    }

    // 5. KHÔI PHỤC GIÁ TRỊ CŨ (Khi mở form sửa)
    if (window.lastfaxValue) {
      faxSelect.val(window.lastfaxValue).trigger('change');
    }
    if (window.lastdepartmentValue) {
      // setTimeout để đảm bảo dropdown Khoa/Phòng đã được đổ dữ liệu sau khi Đơn vị thay đổi
      setTimeout(() => {
        departmentSelect
          .val(window.lastdepartmentValue)
          .trigger('change.select2');
      }, 100);
    }

    console.log('✅ Khởi tạo Dropdown thành công!');
  } catch (err) {
    console.error('❌ Lỗi khi khởi tạo Dropdown:', err);
  }
};

// Toggle skill level dropdown based on radio selection
// Xử lý bật/tắt ô Mức độ và thuộc tính required khi người dùng click chọn Kỹ năng
document.addEventListener('change', function (e) {
  if (e.target && e.target.classList.contains('skill-radio')) {
    // Lấy cái tên gốc, ví dụ 'skill_ruiro'
    const baseName = e.target.name;
    const levelSelect = document.getElementById(`${baseName}_level`);

    if (levelSelect) {
      // Kiểm tra xem user đang chọn Có hay Không
      if (e.target.value === 'Yes' || e.target.value === 'Có') {
        levelSelect.style.display = 'block';
        levelSelect.setAttribute('required', 'required');
      } else {
        levelSelect.style.display = 'none';
        levelSelect.removeAttribute('required'); // Gỡ required đi để submit không lỗi
        levelSelect.value = '';
      }
    }
  }
});
// Hàm lấy số lượt truy cập từ GAS và hiển thị
function fetchVisitCount() {
  // Tạm thời vô hiệu hóa bộ đếm cũ của GAS để web chạy mượt
  console.log('Tính năng đếm lượt truy cập đang được nâng cấp lên Supabase.');

  // Bạn có thể giả lập một con số cho giao diện khỏi trống
  const visitElement = document.getElementById('visitCount');
  if (visitElement) visitElement.textContent = 'Đang cập nhật...';
}
// Gọi hàm ngay khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
  createWardDropdown();
  //fetchVisitCount();
  getUserLocation((loc) => {
    console.log('Đã chuẩn bị sẵn vị trí:', loc);
  });
});
// ========================================================================
// 2. KHỞI CHẠY TỨC THÌ (BỌC THÉP CHỐNG FOUC)
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Phòng hờ nếu bạn quên thêm CSS ở Bước 1, JS sẽ ép ẩn ngay lập tức
  document
    .querySelectorAll('#sidebar .side-menu li[data-roles]')
    .forEach((el) => (el.style.display = 'none'));

  // Khôi phục Session từ LocalStorage để xử lý phân quyền siêu tốc (0 ms)
  const sessionStr = localStorage.getItem('userSession');
  if (sessionStr) {
    try {
      const cachedSession = JSON.parse(sessionStr);
      window.userSession = cachedSession;

      // Phân quyền ngay tắp lự trước cả khi Supabase kịp tải xong
      if (cachedSession.role && typeof applyRolePermissions === 'function') {
        applyRolePermissions(cachedSession.role);
      }
    } catch (e) {}
  }
});
// ============================================================
// QUẢN LÝ AAR (After Action Review)
// ============================================================
// 1. Mở Modal AAR (Đã sửa scope window)
window.openAarModal = async function (incident, isViewOnly) {
  // 1. Reset form (Giữ nguyên DOM logic)
  const form = document.getElementById('aarForm');
  if (form) form.reset();

  // 2. Điền thông tin cơ bản
  $('#aar-incident-id').val(incident.id);
  $('#aar-incident-id-display').text(incident.id);
  $('#aar-location-display').text(incident.location_text || 'N/A');
  $('#aar-event-display').text(incident.event_name || 'N/A');

  // 3. Điền dữ liệu cũ (Dựa trên cấu trúc object incident bạn truyền vào)
  $('#aar-summary').val(incident.aar_summary || '');
  $('#aar-issues').val(incident.aar_issues || '');
  $('#aar-lessons-learned').val(incident.aar_lessons || '');

  // 4. Logic View-Only
  const isView =
    isViewOnly || window.userSession?.role?.toLowerCase() !== 'admin';
  $('#aar-summary').prop('disabled', isView);
  $('#aar-issues').prop('disabled', isView);
  $('#aar-lessons-learned').prop('disabled', isView);
  $('#aar-status').prop('disabled', isView);

  if (isView) {
    $('#btn-submit-aar').hide();
    $('#aar-status').val('closed');
  } else {
    $('#btn-submit-aar').show();
    $('#aar-status').val('closed');
  }

  // 5. Tải nhật ký từ Supabase
  window.currentIncidentLogs = [];

  try {
    const { data: logs, error } = await supabaseClient
      .from('incident_logs')
      .select('*')
      .eq('incident_id', incident.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    window.currentIncidentLogs = logs || [];
    console.log('Đã tải xong nhật ký cho modal AAR.');
  } catch (err) {
    console.error('Lỗi tải log:', err);
    showToast('Lỗi tải nhật ký: ' + err.message, 'error');
  }

  $('#aarModal').modal('show');
};

// ============================================================
// 1. CÁC HÀM XỬ LÝ SỰ KIỆN (EVENT DELEGATION - KHÔNG DÙNG ONCLICK)
// ============================================================
$(document).ready(function () {
  // Mở Modal gợi ý
  $(document).on('click', '#btn-auto-trigger', function () {
    window.openAutoScheduleModal();
  });

  // Áp dụng gợi ý (Nút trong Modal)
  $(document).on('click', '.sug-apply-btn', function () {
    const date = $(this).data('date');
    const team = $(this).data('team');
    window.applySuggestion(date, team);
  });
});
// Hàm logic của bạn (Giữ nguyên hoặc đặt ở bất kỳ đâu)
window.openAutoScheduleModal = async function () {
  console.log('Đang mở Modal...');
  const modal = document.getElementById('modal-auto');

  if (modal) {
    modal.style.display = 'flex';

    // Tự động chọn ngày mai
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dateInput = document.getElementById('auto-date-input');
    if (dateInput) {
      dateInput.value = dateStr;
      if (typeof window.suggestRoster === 'function') {
        window.suggestRoster(dateStr);
      }
    }
  } else {
    showToast('Lỗi: Không tìm thấy giao diện Modal lịch tự động', 'error');
    console.error("Lỗi: Không tìm thấy <div id='modal-auto'>");
  }
};
window.suggestRoster = async function (dateStr) {
  const container = document.getElementById('auto-suggestions-container');
  if (!container) return;

  // Hiện loading
  container.innerHTML =
    '<p class="text-center text-muted mt-3"><span class="spinner-border spinner-border-sm"></span> Đang phân tích dữ liệu đội...</p>';

  try {
    // 1. Lấy dữ liệu từ 2 bảng Supabase
    const [rosterRes, incidentRes] = await Promise.all([
      supabaseClient.from('roster_schedules').select('team_name'),
      supabaseClient
        .from('incident_activities')
        .select('task_group')
        .eq('status', 'active'),
    ]);

    if (rosterRes.error) throw rosterRes.error;

    const history = rosterRes.data || [];
    const busyTeams = (incidentRes.data || []).map((i) => i.task_group);
    const totalTeams = 10;

    // 2. Tính toán số lần trực (công bằng luân phiên)
    const dutyCounts = {};
    for (let i = 1; i <= totalTeams; i++) {
      const tName = `Team ${i}`;
      dutyCounts[tName] = history.filter((h) => h.team_name === tName).length;
    }

    // 3. Phân tích gợi ý
    let suggestions = [];
    for (let i = 1; i <= totalTeams; i++) {
      const teamName = `Team ${i}`;
      let status = 'ok';
      let reason = 'Đội sẵn sàng (Đã trực: ' + dutyCounts[teamName] + ' ca)';

      // Loại trừ đội đang bận
      if (busyTeams.includes(teamName)) {
        status = 'bad';
        reason = 'Đang xử lý sự cố khẩn cấp';
      }

      suggestions.push({
        team: teamName,
        status: status,
        reason: reason,
        count: dutyCounts[teamName],
      });
    }

    // 4. Sắp xếp: Đội bận cho xuống cuối, đội trực ít cho lên đầu
    suggestions.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'bad' ? 1 : -1;
      return a.count - b.count;
    });

    // 5. Render ra Modal
    container.innerHTML = '';
    suggestions.forEach((s) => {
      // 1. Xác định trạng thái logic
      const isBad = s.status === 'bad';

      // 2. Định nghĩa tất cả các biến UI ngay từ đầu vòng lặp
      const itemClass = isBad ? 'sug-bad' : 'sug-good';
      const iconHTML = isBad
        ? '<i class="bx bxs-error-circle text-danger"></i>'
        : '<i class="bx bxs-star text-warning"></i>';
      const btnText = isBad ? 'Không khả dụng' : 'Xếp lịch đội này';
      const btnAttr = isBad ? 'disabled' : '';

      // 3. Xây dựng HTML an toàn
      const html = `
            <div class="suggestion-item ${itemClass}">
                <div class="sug-header">
                    <span class="sug-team fw-bold">${s.team}</span>
                    ${iconHTML}
                </div>
                <div class="text-center p-2">
                    <small class="sug-reason text-muted">${s.reason}</small>
                </div>
                <button class="btn btn-sm ${
                  isBad ? 'btn-outline-secondary' : 'btn-primary'
                } w-100 sug-apply-btn" 
                        ${btnAttr} 
                        data-date="${dateStr}" 
                        data-team="${s.team}">
                    ${btnText}
                </button>
            </div>
        `;

      container.insertAdjacentHTML('beforeend', html);
    });
  } catch (err) {
    console.error('Lỗi Auto Schedule:', err);
    container.innerHTML = `<p class="text-danger text-center">Lỗi tải dữ liệu: ${err.message}</p>`;
  }
};
// ĐẶT Ở ĐẦU FILE SCRIPT.JS (Nơi trình duyệt đọc đầu tiên)
window.applySuggestion = function (date, team) {
  // 1. TẮT FOCUS CỦA NÚT VỪA BẤM ĐỂ TRÁNH CẢNH BÁO MÀU VÀNG
  if (document.activeElement) {
    document.activeElement.blur();
  }

  console.log('Hàm applySuggestion đã được gọi với:', date, team); // Dòng này để debug

  // Đóng modal gợi ý
  if (typeof window.closeModal === 'function') {
    window.closeModal('modal-auto');
  }

  // TẠO NGÀY HIỂN THỊ CHUẨN VIỆT NAM
  let displayDate = date;
  if (displayDate && displayDate.includes('-')) {
    const parts = displayDate.split('T')[0].split('-');
    if (parts.length === 3) {
      displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // Lật thành DD/MM/YYYY
    }
  }

  showToastConfirm(
    `Xác nhận xếp lịch cho <strong>${team}</strong> vào ngày <strong>${displayDate}</strong>?`,
    function () {
      const dateInput = document.getElementById('new-shift-date');
      const teamInput = document.getElementById('new-shift-team');
      const noteInput = document.getElementById('new-shift-note');

      if (dateInput) dateInput.value = date;
      if (teamInput) teamInput.value = team;
      if (noteInput) noteInput.value = 'Được xếp tự động bởi AP Assistant';

      if (typeof window.submitNewShift === 'function') {
        window.submitNewShift();
      } else {
        console.error('Lỗi: submitNewShift không tồn tại');
      }
    }
  );
};
// ==========================================
// HÀM TẠO THÔNG BÁO NỘI BỘ (CHUẨN HÓA THEO DB)
// ==========================================
// Thêm tham số type (mặc định là 'thong_tin'), incidentId, và scheduleId vào khai báo hàm
window.createSystemNotification = async function (
  emails,
  message,
  type = 'thong_tin',
  incidentId = null,
  scheduleId = null
) {
  if (!emails || emails.length === 0) return;

  // Tạo mảng dữ liệu để insert hàng loạt
  const notifData = emails.map((email) => ({
    user_email: email,
    message: message,
    notification_type: type, // Lấy ĐỘNG từ tham số truyền vào, không đóng cứng nữa
    incident_id: incidentId, // Nhận ID từ nơi gọi hàm
    schedule_id: scheduleId, // Nhận ID từ nơi gọi hàm
  }));

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .insert(notifData);

    if (error) throw error;
    console.log(`✅ Đã bắn ${emails.length} thông báo loại [${type}].`);
  } catch (err) {
    console.error('❌ Lỗi tạo thông báo:', err);
  }
};
let miniMap = null;
let miniMarker = null;

window.initMiniMap = async function () {
  const defaultLat = 10.762622;
  const defaultLng = 106.660172;

  if (miniMap !== null) {
    miniMap.remove();
  }

  miniMap = L.map('miniMap').setView([defaultLat, defaultLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(miniMap);

  miniMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(
    miniMap
  );

  // Điền mặc định tọa độ tâm ban đầu
  document.getElementById('incidentLat').value = defaultLat;
  document.getElementById('incidentLng').value = defaultLng;

  // 1. Kích hoạt tải ngầm file hcm_map.json từ bucket lên bộ nhớ trình duyệt ngay khi mở bản đồ
  const geojsonData = await window.loadGeoJSON();

  // Hiển thị ranh giới mờ lên mini-map cho sinh động (Tùy chọn)
  if (geojsonData) {
    L.geoJSON(geojsonData, {
      style: {
        color: '#198754',
        weight: 1,
        fillOpacity: 0.05,
        pointerEvents: 'none',
      },
    }).addTo(miniMap);
  }

  // 2. Xử lý sự kiện kéo ghim
  miniMarker.on('dragend', function (e) {
    const position = miniMarker.getLatLng();

    // Điền tọa độ thực
    document.getElementById('incidentLat').value = position.lat;
    document.getElementById('incidentLng').value = position.lng;

    // Tiến hành quét không gian cục bộ (0 VNĐ) để tìm mã xã
    const locationResult = window.findWardByCoordinates(
      position.lat,
      position.lng
    );

    if (locationResult) {
      // 1. Điền mã số hành chính chuẩn xác tuyệt đối vào ô input ẩn để insert Supabase
      document.getElementById('incidentWard').value = locationResult.maXa;

      // 2. Cập nhật nhãn text địa điểm trực quan ra màn hình cho admin xem
      document.getElementById(
        'incidentLocation'
      ).value = `${locationResult.tenXa} (Đã chốt vị trí hành chính)`;
      console.log(
        `🎯 Đã định vị ổ dịch tại Mã Xã: ${locationResult.maXa} - ${locationResult.tenXa}`
      );
    } else {
      // Phòng hờ kéo ghim ra ngoài biển hoặc tỉnh lân cận
      document.getElementById('incidentLocation').value =
        'Vị trí nằm ngoài ranh giới Thành phố!';
      document.getElementById('incidentWard').value = '';
    }
  });
  // ============================================================
  // BỔ SUNG: XỬ LÝ LƯỜNG NGƯỢC (GÕ ĐỊA CHỈ -> CỤC MARKER NHẢY THEO)
  // ============================================================
  const locationInput = document.getElementById('incidentLocation');

  // Dùng biến timeout để chống spam API (người dùng gõ liên tục thì đợi gõ xong mới tìm)
  let typingTimer;

  locationInput.addEventListener('input', function () {
    clearTimeout(typingTimer);

    // Đợi người dùng ngừng gõ 800ms rồi mới bắt đầu tìm kiếm
    typingTimer = setTimeout(async function () {
      const query = locationInput.value.trim();
      if (query.length < 5) return; // Bỏ qua nếu gõ quá ngắn

      try {
        // Gọi API Nominatim miễn phí để tìm tọa độ từ chuỗi địa chỉ
        // Thêm "Ho Chi Minh City" vào cuối để ưu tiên tìm trong khu vực HCM
        const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query + ', Ho Chi Minh City'
        )}&limit=1`;
        const response = await fetch(searchUrl);
        const results = await response.json();

        if (results && results.length > 0) {
          const foundLat = parseFloat(results[0].lat);
          const foundLng = parseFloat(results[0].lon);

          // 1. Bay bản đồ tới đó và dời cục Marker
          miniMap.flyTo([foundLat, foundLng], 14, { duration: 1.5 });
          miniMarker.setLatLng([foundLat, foundLng]);

          // 2. Điền tọa độ ẩn
          document.getElementById('incidentLat').value = foundLat;
          document.getElementById('incidentLng').value = foundLng;

          // 3. Quét không gian để tìm lại Mã Xã chính xác từ GeoJSON
          const locationResult = window.findWardByCoordinates(
            foundLat,
            foundLng
          );
          if (locationResult) {
            document.getElementById('incidentWard').value = locationResult.maXa;
            console.log(
              `🎯 Đã bay đến: ${locationResult.maXa} - ${locationResult.tenXa}`
            );
          }
        }
      } catch (error) {
        console.error('Lỗi tìm kiếm địa chỉ:', error);
      }
    }, 800);
  });
};

// Đánh thức bản đồ khi modal mở ra
$('#emergencyDetailsModal')
  .off('shown.bs.modal')
  .on('shown.bs.modal', function () {
    window.initMiniMap();
    setTimeout(() => {
      if (miniMap) miniMap.invalidateSize();
    }, 200);
  });
// Thuật toán Ray-Casting kiểm tra điểm nằm trong một vòng tọa độ
function isPointInRing(point, ring) {
  let x = point[0],
    y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0],
      yi = ring[i][1];
    let xj = ring[j][0],
      yj = ring[j][1];
    let intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Hàm tổng hợp kiểm tra cho cả Polygon và MultiPolygon
window.findWardByCoordinates = function (lat, lng) {
  const geojson = window.appState.mapGeoData;
  if (!geojson || !geojson.features) return null;

  // Lưu ý: GeoJSON sử dụng định dạng hệ tọa độ [Kinh độ, Vĩ độ] tức là [lng, lat]
  const point = [parseFloat(lng), parseFloat(lat)];

  for (let feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    let isInside = false;

    if (geometry.type === 'Polygon') {
      // Vòng đầu tiên (geometry.coordinates[0]) luôn là ranh giới ngoài của vùng
      if (isPointInRing(point, geometry.coordinates[0])) {
        isInside = true;
      }
    } else if (geometry.type === 'MultiPolygon') {
      // Duyệt qua từng Polygon cấu thành nên MultiPolygon
      for (let polygonCoords of geometry.coordinates) {
        if (isPointInRing(point, polygonCoords[0])) {
          isInside = true;
          break;
        }
      }
    }

    if (isInside) {
      // Trả về toàn bộ thuộc tính của Phường/Xã đó khi tìm thấy
      return {
        maXa: feature.properties.maXa,
        // Bạn có thể đổi tên cột 'tenXa' hoặc 'name' cho khớp với các thuộc tính chữ khác trong file json của bạn
        tenXa:
          feature.properties.tenXa ||
          feature.properties.ten_xa ||
          feature.properties.name ||
          'Phường/Xã',
      };
    }
  }
  return null; // Không nằm trong ranh giới TP.HCM
};

/**
 * Phê duyệt form đăng ký (Duyệt hồ sơ người dùng trong bảng 'profiles')
 * @param {string} profileId - ID của người dùng cần duyệt (UUID)
 * @param {string} userEmail - Email để gửi thông báo (optional)
 */
window.approveReport = async function (profileId, userEmail) {
  console.log('🔍 [approveReport] Bắt đầu duyệt hồ sơ...', {
    profileId,
    userEmail,
  });

  // Validate input
  if (!profileId || profileId === 'undefined' || profileId === '') {
    console.error('❌ profileId không hợp lệ:', profileId);
    showToast('Lỗi: Không tìm thấy ID hồ sơ cần duyệt!', 'error');
    return;
  }

  // Đảm bảo có loading
  if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

  try {
    // ✅ BƯỚC 1: Kiểm tra profile có tồn tại không (debug)
    const { data: checkData, error: checkErr } = await window.supabaseClient
      .from('profiles')
      .select('id, email, full_name, approval_status')
      .eq('id', profileId)
      .maybeSingle();

    if (checkErr) {
      console.warn('⚠️ Không tìm thấy profile để check:', checkErr.message);
    } else if (!checkData) {
      console.warn('⚠️ Profile không tồn tại với ID:', profileId);
      // Thử fallback: tìm theo email nếu có
      if (userEmail) {
        console.log('🔄 Thử tìm theo email:', userEmail);
        const { data: emailData } = await window.supabaseClient
          .from('profiles')
          .select('id, approval_status')
          .eq('email', userEmail)
          .maybeSingle();

        if (emailData) {
          profileId = emailData.id; // Update lại ID đúng
          console.log('✅ Tìm thấy profile qua email, ID mới:', profileId);
        }
      }
    } else {
      console.log('✅ Found profile:', {
        id: checkData.id,
        email: checkData.email,
        current_status: checkData.approval_status,
      });
    }

    // ✅ BƯỚC 2: Thực hiện update với .select() để verify
    const {
      data: updated,
      error: updateErr,
      count,
    } = await window.supabaseClient
      .from('profiles')
      .update({
        approval_status: 'approved', // ✅ Đảm bảo tên cột đúng theo schema
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select() // ✅ Quan trọng: trả về dữ liệu sau update để verify
      .maybeSingle();

    if (updateErr) {
      console.error('❌ Supabase update error:', updateErr);

      // Xử lý lỗi phổ biến
      if (updateErr.code === 'PGRST116') {
        throw new Error(
          'Không tìm thấy hồ sơ với ID này. Vui lòng kiểm tra lại.'
        );
      } else if (updateErr.message?.includes('approval_status')) {
        throw new Error(
          'Cột "approval_status" không tồn tại. Liên hệ admin để kiểm tra schema.'
        );
      } else if (updateErr.message?.includes('policy')) {
        throw new Error(
          'Bạn không có quyền phê duyệt hồ sơ. Vui lòng đăng nhập bằng tài khoản Admin.'
        );
      }

      throw new Error(updateErr.message || 'Lỗi cập nhật database');
    }

    // ✅ BƯỚC 3: Verify update thành công
    if (!updated) {
      console.warn(
        '⚠️ Update succeeded but no row returned (count:',
        count,
        ')'
      );
      // Có thể do RLS chặn, hoặc ID không khớp
      throw new Error(
        'Cập nhật thành công nhưng không tìm thấy dữ liệu phản hồi. Vui lòng tải lại trang.'
      );
    }

    console.log('✅ Phê duyệt thành công:', {
      id: updated.id,
      new_status: updated.approval_status,
      updated_at: updated.updated_at,
    });

    showToast('✅ Phê duyệt hồ sơ thành công!', 'success');

    // ✅ BƯỚC 4: Refresh UI
    // Vẽ lại giao diện
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
    if (typeof window.renderRRTTable === 'function') {
      await window.renderRRTTable();
    }
    // ✅ BƯỚC 5: Gửi thông báo cho user (nếu có email)
    if (userEmail && typeof window.createSystemNotification === 'function') {
      await window.createSystemNotification(
        [userEmail],
        '🎉 Hồ sơ RRT của bạn đã được phê duyệt! Bạn có thể đăng nhập và tham gia đội.',
        'phe_duyet',
        null,
        profileId
      );
      console.log('📧 Đã gửi thông báo phê duyệt tới:', userEmail);
    }

    // ✅ BƯỚC 6: Đóng modal nếu có
    if (typeof window.closeModal === 'function') {
      window.closeModal('modal-report-detail');
    }
  } catch (err) {
    console.error('❌ Lỗi approveReport:', err);
    showToast('Lỗi phê duyệt: ' + err.message, 'error');
  } finally {
    if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
  }
};
// ========================================================================
// HÀM PHÂN QUYỀN GIAO DIỆN TỔNG HỢP (Người Gác Cổng)
// Đặt ở ngoài cùng của file script.js
// ========================================================================
window.applyRolePermissions = function (role) {
  // Lấy role từ tham số truyền vào, nếu không có thì lấy từ Session, mặc định là 'user'
  let userRole = role || window.userSession?.role || 'user';
  userRole = userRole.toLowerCase().trim();

  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' || isAdmin;

  console.log(
    `🔐 Đang áp dụng phân quyền toàn cục cho Role: ${userRole.toUpperCase()}`
  );

  // 1. ẨN/HIỆN MENU SIDEBAR (Hỗ trợ cả jQuery và JS thuần để chống lỗi)
  if (typeof $ !== 'undefined') {
    $('#sidebar .side-menu li').each(function () {
      const allowedRoles = $(this).attr('data-roles');
      if (allowedRoles) {
        const rolesArray = allowedRoles
          .split(',')
          .map((r) => r.trim().toLowerCase());
        if (rolesArray.includes(userRole) || isAdmin) {
          $(this).show();
        } else {
          $(this).hide();
        }
      } else {
        $(this).show(); // Menu public mặc định hiện
      }
    });
  } else {
    // Dự phòng nếu jQuery chưa load
    document.querySelectorAll('#sidebar .side-menu li').forEach((li) => {
      const allowedRoles = li.getAttribute('data-roles');
      if (allowedRoles) {
        const rolesArray = allowedRoles
          .split(',')
          .map((r) => r.trim().toLowerCase());
        li.style.display =
          rolesArray.includes(userRole) || isAdmin ? '' : 'none';
      } else {
        li.style.display = '';
      }
    });
  }

  // 2. ẨN/HIỆN NÚT CHỨC NĂNG THEO THUỘC TÍNH (data-permission)
  document.querySelectorAll('[data-permission]').forEach((el) => {
    const perm = el.getAttribute('data-permission');
    if (perm === 'admin' && !isAdmin) {
      el.style.display = 'none';
    } else if (perm === 'manager' && !isManager) {
      el.style.display = 'none';
    } else {
      el.style.display = ''; // Khôi phục hiển thị nếu có quyền
    }
  });

  // 3. ẨN/HIỆN CÁC NÚT ĐẶC BIỆT THEO ID CỤ THỂ
  const adminOnlyIds = [
    'btn-create-course-trigger',
    'btn-add-doc',
    'admin-rotation-controls',
    'btn-export-members',
    'btn-export-logistics',
    'btn-delete-roster',
    'btn-open-plan-modal',
    'btn-open-aar-modal',
    'btn-auto-trigger',
  ];

  adminOnlyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = isAdmin ? '' : 'none';
    }
  });

  // 4. THIẾT LẬP CỜ PHÂN QUYỀN TOÀN CỤC CHO CÁC MODULE KHÁC
  window.appState = window.appState || {};
  window.appState.permissions = {
    role: userRole,
    canAccess: {
      dashboard: true,
      datatable: true,
      roster: isAdmin,
      emergency: isAdmin,
      team: isManager,
      training: isManager,
      logistics: isAdmin,
      library: isAdmin,
      map: true,
    },
  };

  console.log('✅ Phân quyền giao diện hoàn tất.');
};
