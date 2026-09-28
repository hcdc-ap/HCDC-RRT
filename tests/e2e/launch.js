// Khởi động Chrome cho các script e2e.
const { chromium } = require('playwright-core');

// Chrome headless tự xưng "HeadlessChrome" trong user-agent và code.highcharts.com
// trả 403 cho UA này (Highcharts không nạp được → báo lỗi giả). Đổi về UA Chrome thường.
async function launchBrowser() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
  });
  const probe = await browser.newPage();
  const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace('HeadlessChrome', 'Chrome');
  await probe.close();
  return { browser, userAgent };
}

module.exports = { launchBrowser };
