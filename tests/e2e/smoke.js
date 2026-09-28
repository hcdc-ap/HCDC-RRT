#!/usr/bin/env node
// Kiểm thử end-to-end với Supabase THẬT: đăng nhập bằng tài khoản test, mở lần
// lượt các trang, báo mọi lỗi JavaScript (pageerror / console.error) và request
// Supabase lỗi. Chỉ ĐỌC — không bấm nút tạo/sửa/xóa.
//
//   npm start                                   # terminal 1: chạy app ở :8080
//   RRT_TEST_EMAIL=... RRT_TEST_PASSWORD=... npm run e2e   # terminal 2
//
// Biến môi trường:
//   BASE_URL        (mặc định http://localhost:8080)
//   CHROME_PATH     đường dẫn Chrome/Chromium; mặc định dùng Google Chrome đã cài
//   HEADLESS=0      mở cửa sổ trình duyệt để xem
const { launchBrowser } = require('./launch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const { RRT_TEST_EMAIL: EMAIL, RRT_TEST_PASSWORD: PASSWORD } = process.env;
const PAGES = [
  'page-dashboard', 'page-datatable', 'page-roster', 'page-emergency',
  'page-tracking', 'page-team', 'page-training', 'page-logistics',
  'page-library', 'page-map', 'page-notification',
];

(async () => {
  if (!EMAIL || !PASSWORD) {
    console.error('Cần RRT_TEST_EMAIL và RRT_TEST_PASSWORD (tài khoản test, KHÔNG dùng tài khoản thật).');
    process.exit(2);
  }
  const { browser, userAgent } = await launchBrowser();
  try {
    await run(browser, userAgent);
  } finally {
    // Không đóng thì Chrome giữ tiến trình node sống mãi khi có lỗi (vd. đăng nhập sai).
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 2;
});

async function run(browser, userAgent) {
  const page = await browser.newPage({ userAgent });
  const problems = [];
  let where = 'load';
  page.on('pageerror', (e) => problems.push(`[${where}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${where}] console.error: ${m.text().slice(0, 300)}`);
  });
  page.on('response', (r) => {
    if (/supabase\.co\/(rest|functions)\//.test(r.url()) && r.status() >= 400)
      problems.push(`[${where}] HTTP ${r.status()} ${r.request().method()} ${r.url().split('supabase.co')[1].slice(0, 200)}`);
  });
  page.on('requestfailed', (r) =>
    problems.push(`[${where}] request lỗi mạng (${r.failure()?.errorText}): ${r.url().slice(0, 200)}`)
  );

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.fill('#login-user', EMAIL);
  await page.fill('#login-password', PASSWORD);
  where = 'login';
  await page.$eval('#login-form', (f) => f.requestSubmit());
  try {
    await page.waitForFunction(() => window.userSession?.id && window.appState?.appInitialized, null, { timeout: 30000 });
  } catch {
    throw new Error(`Đăng nhập thất bại hoặc app không khởi động sau 30 giây (${EMAIL}). Kiểm tra lại email/mật khẩu.`);
  }
  const role = await page.evaluate(() => window.userSession.role);
  console.log(`Đăng nhập OK (${EMAIL}, role=${role})`);
  await page.waitForTimeout(3000);

  for (const id of PAGES) {
    where = id;
    const visible = await page.evaluate(async (pid) => {
      if (typeof window.showSectionById !== 'function') return 'no-router';
      await window.showSectionById(pid);
      const el = document.getElementById(pid);
      return el ? getComputedStyle(el).display !== 'none' : 'missing';
    }, id);
    await page.waitForTimeout(2500);
    console.log(`${visible === true ? '✓' : '·'} ${id}${visible === true ? '' : ` (${visible})`}`);
  }

  if (problems.length) {
    console.log(`\n${problems.length} vấn đề:`);
    for (const p of problems) console.log('  ' + p);
    process.exitCode = 1;
  } else console.log('\nKhông có lỗi JavaScript hay request Supabase lỗi.');
}
