// ============================================================
// CORE — Khởi tạo Supabase, điều hướng, xác thực, vào dashboard, đăng xuất
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

// Không gian dùng chung giữa các file js/app/* (thay cho closure chung của script.js cũ)
window.rrtShared = window.rrtShared || {};

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
            // Refresh trang "Theo dõi sự kiện" nếu đang mở — forceFetch=true vì
            // renderTrackingPage() mặc định chỉ tải lại khi appState.trackingIncidents
            // rỗng, nên nếu không ép tải lại, sự kiện mới kích hoạt/vừa đóng sẽ
            // không hiện ra cho tới khi người dùng F5 lại trang.
            if (
              document.getElementById('page-tracking')?.style.display !==
                'none' &&
              typeof window.renderTrackingPage === 'function'
            ) {
              window.renderTrackingPage(true);
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
            if (
              document.getElementById('page-tracking')?.style.display !==
                'none' &&
              typeof window.renderTrackingPage === 'function'
            ) {
              window.renderTrackingPage(true);
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

  // Kiểm tra quyền Admin để hiện nút xuất báo cáo

  if (window.userSession && window.userSession.role === 'admin') {
    $('#btn-export-members').show();
    $('#btn-export-logistics').show();
  }

  // Hoàn tất
  if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
};

// ========================================================================
// HELPER: LOẠI TÀI KHOẢN LIMS KHỎI DANH SÁCH NGƯỜI DÙNG RRT
// ========================================================================
// Bảng profiles dùng chung với LIMS: các role sau chỉ thuộc về LIMS và
// không thuộc phạm vi quản lý của RRT, phải loại khỏi mọi màn hình/
// truy vấn danh sách người dùng, KPI, export... của RRT.
window.LIMS_ONLY_ROLES = ['lab_admin', 'hcdc_admin'];

window.excludeLimsProfiles = function (dataArray) {
  if (!Array.isArray(dataArray)) return [];
  return dataArray.filter(
    (item) =>
      !window.LIMS_ONLY_ROLES.includes(
        String(item?.role || '')
          .toLowerCase()
          .trim()
      )
  );
};

// ========================================================================
// HELPER: LỌC DỮ LIỆU THEO ROLE (User/Admin)
// ========================================================================
window.filterDataByRole = function (dataArray) {
  if (!Array.isArray(dataArray)) return [];

  dataArray = window.excludeLimsProfiles(dataArray);

  const userRole = (window.userSession?.role || '').toLowerCase();
  const userId = window.userSession?.id || window.userSession?.user?.id;
  const userEmail = window.userSession?.email;

  // ✅ ADMIN (thành phố): Xem tất cả
  if (userRole === 'admin') {
    return dataArray;
  }

  // ✅ WARD_ADMIN (tuyến cơ sở): Chỉ xem nhân sự CÙNG XÃ CÔNG TÁC + là tuyến cơ sở
  if (userRole === 'ward_admin') {
    const myWorkplace = String(window.userSession?.workplace_ward || '')
      .toLowerCase()
      .trim();
    // 2 chuỗi tuyến cơ sở — KHỚP với is_grassroots_unit ở DB
    const grassrootsUnits = [
      'trạm y tế phường/xã/ đặc khu',
      'ubnd phường/xã/ đặc khu',
    ];
    return dataArray.filter((item) => {
      const itemWorkplace = String(item.workplace_ward || '')
        .toLowerCase()
        .trim();
      const itemFax = String(item.fax || '')
        .toLowerCase()
        .trim();
      // Chỉ thấy người: cùng xã công tác VÀ thuộc tuyến cơ sở
      return (
        itemWorkplace &&
        itemWorkplace === myWorkplace &&
        grassrootsUnits.includes(itemFax)
      );
    });
  }

  // ✅ USER thường: Chỉ xem dữ liệu của chính mình
  return dataArray.filter((item) => {
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

    const dashboardBatch = await batchFetch([
      // Profiles - LỌC THEO ROLE
      () =>
        QueryCache.fetch(`profiles:${currentUserRole}`, async () => {
          let query = window.supabaseClient
            .from('profiles')
            .select(
              'id, email, full_name, role, team, position, deployment_status, approval_status, workplace_ma_xa, fax'
            )
            .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`);

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
              'id, event_name, status, location_text, ma_xa, activation_time, members, initial_selected_members, declined_members, confirmations'
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
            .select(
              'id, incident_id, user_id, action_type, confirmed_at, created_at'
            )
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
    const [
      profilesRes,
      incidentsRes,
      trainingRes,
      deploymentRes,
      notificationsRes,
    ] = dashboardBatch;

    // Truy vấn lỗi trả về null (xem utils/batch-fetch.js) — báo cho người dùng
    // biết dữ liệu có thể thiếu thay vì im lặng hiển thị danh sách rỗng.
    if (dashboardBatch.errors.length && typeof showToast === 'function') {
      showToast(
        'Một số dữ liệu chưa tải được, vui lòng tải lại trang.',
        'warning'
      );
    }

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
      window.go?.('dashboard');
      document.getElementById('menu-dashboard')?.click();
      // Đóng profile menu phòng khi click làm nó mở
      $('.profile-menu, .notification-menu').removeClass('show').hide();
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
  try {
    window.RealtimeManager?.stop?.();
  } catch (e) {
    console.warn('⚠️ Lỗi dừng Realtime:', e);
  }

  // ✅ 2. Clear local state — XÓA ĐÚNG TÊN CACHE app đang dùng
  window.userSession = null;
  if (window.appState) {
    window.appState.appInitialized = false;
    window.appState.teamData = []; // danh sách thành viên
    window.appState.trackingIncidents = []; // sự kiện đang theo dõi
    window.appState.roster_schedules = []; // lịch trực
    window.appState.deployment_history = []; // nhật ký điều động
    window.appState.notifications_list = []; // danh sách thông báo
    window.appState.profiles = []; // hồ sơ người dùng (rất quan trọng)
    window.appState.library = []; // thư viện tài liệu
    window.appState.users = []; // (tên cũ, giữ cho an toàn)
    window.appState.incidents = []; // (tên cũ, giữ cho an toàn)
    window.appState.notifications = []; // (tên cũ, giữ cho an toàn)
    window.appState.training_courses = [];
  }
  // Đặt lại cờ đăng ký filter điều động để phiên mới không dùng lại filter cũ
  window._emerFilterRegistered = false;

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

  // ✅ 6. Redirect về login (GIỮ NGUYÊN window.go — đúng cơ chế app)
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
    training: false,
    notification: false,
  };

  // --- Cache DỮ LIỆU phiên (QUAN TRỌNG: xóa để không rò sang tài khoản kế tiếp) ---
  window.appState.teamData = []; // danh sách thành viên
  window.appState.trackingIncidents = []; // sự kiện đang theo dõi
  window.appState.roster_schedules = []; // lịch trực
  window.appState.deployment_history = []; // nhật ký điều động
  window.appState.notifications_list = []; // danh sách thông báo
  window.appState.profiles = []; // hồ sơ người dùng (rất quan trọng)
  window.appState.library = []; // thư viện tài liệu
  window.appState.users = []; // (tên cũ, giữ cho an toàn)
  window.appState.incidents = []; // (tên cũ, giữ cho an toàn)
  window.appState.notifications = []; // (tên cũ, giữ cho an toàn)
  window.appState.training_courses = [];

  // --- Reset map ---
  window.appState.map = null;
  window.appState.geojsonBaseLayer = null;
  window.appState.choroplethLayer = null;
  window.appState.markersLayerGroup = null;
  window.appState.mapGeojsonData = null;
  window.appState.mapCompanyData = [];
  window.appState.filteredData = [];

  // --- Cờ đăng ký filter điều động (đăng ký lại ở phiên mới) ---
  window._emerFilterRegistered = false;

  console.log(
    '✅ appState reset (đã xóa toàn bộ cache dữ liệu phiên + bản đồ)'
  );
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

      const { error: authError } =
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
