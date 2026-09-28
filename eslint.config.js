// ESLint (flat config) cho webapp HCDC-RRT — chạy: npm run lint
//
// App là các "classic script" nạp tuần tự trong index.html và chia sẻ biến qua
// window.*, nên danh sách biến toàn cục của app được TỰ ĐỘNG thu thập từ mã
// nguồn (các phép gán `window.X = ...` và khai báo top-level). Nhờ vậy rule
// no-undef vẫn bắt được lỗi gõ sai tên hàm/biến mà không phải liệt kê tay.
const fs = require('fs');
const path = require('path');
const js = require('@eslint/js');
const globals = require('globals');

const APP_FILES = [
  'auth-helpers.js',
  'team-response-stats.js',
  'huong-dan-data.js',
  'huong-dan-engine.js',
  'utils/*.js',
  'js/app/*.js',
  'lab-*.js',
];

function listFiles() {
  const out = [];
  for (const dir of ['.', 'utils', 'js/app']) {
    for (const f of fs.readdirSync(path.join(__dirname, dir))) {
      if (f.endsWith('.js') && f !== 'eslint.config.js') out.push(path.join(__dirname, dir, f));
    }
  }
  return out;
}

function collectAppGlobals() {
  const names = new Set();
  const patterns = [
    /\bwindow\.([A-Za-z_$][\w$]*)\s*=[^=]/g,
    /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/gm,
    /^(?:var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const file of listFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const re of patterns) for (const m of src.matchAll(re)) names.add(m[1]);
  }
  return Object.fromEntries([...names].map((n) => [n, 'writable']));
}

const LIBRARY_GLOBALS = {
  $: 'readonly',
  jQuery: 'readonly',
  bootstrap: 'readonly',
  moment: 'readonly',
  L: 'readonly',
  Highcharts: 'readonly',
  XLSX: 'readonly',
  jspdf: 'readonly',
  jsPDF: 'readonly',
  pdfMake: 'readonly',
  proj4: 'readonly',
  DataTable: 'readonly',
  supabase: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: APP_FILES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...LIBRARY_GLOBALS, ...collectAppGlobals() },
    },
    rules: {
      // Code cũ có nhiều biến/tham số không dùng và catch rỗng — cảnh báo,
      // không chặn CI; sửa dần khi đụng tới file.
      // vars: 'local' — hàm/biến top-level là biến toàn cục, có thể được gọi
      // từ file khác hoặc onclick trong HTML nên không tính là "không dùng".
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-inner-declarations': 'off',
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  {
    files: ['eslint.config.js', 'tests/**/*.js', 'tools/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
  },
  {
    // callback của page.evaluate() chạy trong trình duyệt
    files: ['tests/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
