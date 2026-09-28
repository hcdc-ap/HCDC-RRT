#!/usr/bin/env node
// Kiểm thử luồng QUÊN MẬT KHẨU với Supabase THẬT (gửi email thật, đổi mật khẩu thật
// của tài khoản test). Cần người chạy mở hộp thư và dán link khôi phục vào terminal.
//
//   npm start                                   # terminal 1: chạy app ở :8080
//   RRT_TEST_EMAIL=... RRT_NEW_PASSWORD=... npm run e2e:recovery   # terminal 2
//
// Yêu cầu: http://localhost:8080/** nằm trong Supabase → Authentication →
// URL Configuration → Redirect URLs (nếu không, link sẽ chuyển về trang LIMS).
//
// Biến môi trường:
//   RRT_TEST_EMAIL    email tài khoản test (KHÔNG dùng tài khoản thật)
//   RRT_NEW_PASSWORD  mật khẩu mới: 8-32 ký tự, có chữ hoa, thường, số, ký tự đặc biệt
//   BASE_URL          (mặc định http://localhost:8080)
//   CHROME_PATH       đường dẫn Chrome/Chromium; mặc định dùng Google Chrome đã cài
//   HEADLESS=0        mở cửa sổ trình duyệt để xem
const readline = require('readline/promises');
const { launchBrowser } = require('./launch');

let userAgent;

const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const { RRT_TEST_EMAIL: EMAIL, RRT_NEW_PASSWORD: NEW_PASSWORD } = process.env;

let failed = 0;
function check(ok, msg) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
  return ok;
}

async function newPage(browser, problems) {
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return page;
}

// Chờ app khởi động xong phần nhận diện link (core.js + login-ui.js)
async function waitForApp(page) {
  await page.waitForFunction(
    () => window.supabaseClient && typeof window.startPasswordRecovery === 'function',
    null,
    { timeout: 20000 }
  );
}

const isVisible = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
  }, sel);

(async () => {
  if (!EMAIL || !NEW_PASSWORD) {
    console.error('Cần RRT_TEST_EMAIL và RRT_NEW_PASSWORD (tài khoản test, KHÔNG dùng tài khoản thật).');
    process.exit(2);
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d\s]).{8,32}$/.test(NEW_PASSWORD)) {
    console.error('RRT_NEW_PASSWORD phải 8-32 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.');
    process.exit(2);
  }

  const launched = await launchBrowser();
  const browser = launched.browser;
  userAgent = launched.userAgent;
  const problems = [];

  // ---- 1. Gửi email khôi phục từ form "Quên mật khẩu?" ----
  let page = await newPage(browser, problems);
  let redirectTo = null;
  let recoverStatus = null;
  page.on('request', (r) => {
    if (/\/auth\/v1\/recover/.test(r.url())) redirectTo = new URL(r.url()).searchParams.get('redirect_to');
  });
  page.on('response', (r) => {
    if (/\/auth\/v1\/recover/.test(r.url())) recoverStatus = r.status();
  });
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await waitForApp(page);
  check(await isVisible(page, '#forgot-pass'), 'Có nút "Quên mật khẩu?" trên trang đăng nhập');
  await page.click('#forgot-pass');
  await page.fill('#recover-user', EMAIL);
  await page.$eval('#recover-form', (f) => f.requestSubmit());
  await page.waitForResponse((r) => /\/auth\/v1\/recover/.test(r.url()), { timeout: 20000 });
  check(recoverStatus === 200, `Supabase nhận yêu cầu gửi email (HTTP ${recoverStatus})`);
  if (recoverStatus === 429) console.log('  → Bị giới hạn tần suất gửi email, đợi vài phút rồi chạy lại.');
  check(
    redirectTo && redirectTo.startsWith(BASE_URL),
    `redirect_to trỏ về trang RRT (${redirectTo || 'không có'}), không phải LIMS`
  );
  await page.context().close();
  if (recoverStatus !== 200) return finish(browser, problems);

  // ---- 2. Người chạy dán link từ email ----
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nĐã gửi email tới ${EMAIL}. Mở email MỚI NHẤT, chuột phải vào link → Copy link address.`);
  const link = (await rl.question('Dán link vào đây rồi Enter: ')).trim();
  rl.close();
  if (!/^https?:\/\//.test(link)) {
    check(false, 'Link không hợp lệ');
    return finish(browser, problems);
  }

  // ---- 3. Mở link → phải về trang RRT và hiện form đặt mật khẩu mới ----
  page = await newPage(browser, problems);
  await page.goto(link, { waitUntil: 'load' });
  check(page.url().startsWith(BASE_URL), `Link chuyển về trang RRT (${page.url().split('#')[0]})`);
  await waitForApp(page);
  const linkError = await page.evaluate(() => window.rrtShared.authLinkError);
  if (!check(!linkError, 'Link còn hiệu lực' + (linkError ? ` (lỗi: ${linkError.code})` : ''))) {
    return finish(browser, problems);
  }
  await page.waitForFunction(
    () => document.querySelector('#otp-reset')?.style.display !== 'none',
    null,
    { timeout: 15000 }
  ).catch(() => {});
  check(await isVisible(page, '#otp-reset'), 'Hiện form "Đặt lại mật khẩu"');
  check(
    (await page.inputValue('#otp-email')) === EMAIL,
    'Form hiện đúng email của tài khoản'
  );
  await page.waitForTimeout(3000); // chờ xem app có tự nhảy vào dashboard không
  check(
    !(await page.evaluate(() => window.appState?.appInitialized)),
    'KHÔNG tự vào dashboard bằng phiên tạm từ link'
  );

  // ---- 4. Đặt mật khẩu mới ----
  let updateStatus = null;
  page.on('response', (r) => {
    if (/\/auth\/v1\/user/.test(r.url()) && r.request().method() === 'PUT') updateStatus = r.status();
  });
  await page.fill('#new-password', NEW_PASSWORD);
  await page.fill('#new-confirm-password', NEW_PASSWORD);
  await page.$eval('#otp-form', (f) => f.requestSubmit());
  await page
    .waitForFunction(() => document.querySelector('#login')?.style.display !== 'none', null, { timeout: 20000 })
    .catch(() => {});
  check(updateStatus === 200, `Supabase cập nhật mật khẩu (HTTP ${updateStatus})`);
  check(await isVisible(page, '#login'), 'Quay về form đăng nhập sau khi đổi');
  check(
    !(await page.evaluate(() => window.supabaseClient.auth.getSession().then((r) => !!r.data.session))),
    'Phiên tạm đã được đăng xuất'
  );
  await page.context().close();

  // ---- 5. Đăng nhập bằng mật khẩu mới ----
  page = await newPage(browser, problems);
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await waitForApp(page);
  await page.fill('#login-user', EMAIL);
  await page.fill('#login-password', NEW_PASSWORD);
  await page.$eval('#login-form', (f) => f.requestSubmit());
  const loggedIn = await page
    .waitForFunction(() => window.userSession?.id, null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  check(loggedIn, 'Đăng nhập được bằng mật khẩu mới');
  await page.context().close();

  // ---- 6. Mở lại link cũ → phải báo link hết hạn ----
  page = await newPage(browser, problems);
  await page.goto(link, { waitUntil: 'load' });
  await waitForApp(page);
  const reuseError = await page.evaluate(() => window.rrtShared.authLinkError);
  check(
    page.url().startsWith(BASE_URL) && reuseError?.code === 'otp_expired',
    `Mở lại link cũ: về RRT và báo hết hạn (${reuseError?.code || 'không có lỗi'})`
  );
  await page.context().close();

  return finish(browser, problems);
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});

async function finish(browser, problems) {
  await browser.close();
  if (problems.length) {
    console.log(`\n${problems.length} lỗi JavaScript:`);
    for (const p of problems) console.log('  ' + p);
  }
  if (failed || problems.length) {
    console.log(`\n✗ ${failed} bước không đạt.`);
    process.exitCode = 1;
  } else console.log('\n✓ Luồng quên mật khẩu hoạt động đúng.');
}
