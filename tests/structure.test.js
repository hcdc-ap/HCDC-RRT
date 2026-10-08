// Kiểm tra cấu trúc: index.html nạp đúng file, các file js/app/* hợp lệ, và
// mọi thứ dùng qua rrtShared đều được file nào đó đăng ký.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers/browser-env');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const localScripts = [...html.matchAll(/<script src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => !/^https?:/.test(s));

test('mọi <script src> local trong index.html đều tồn tại', () => {
  for (const s of localScripts) assert.ok(fs.existsSync(path.join(ROOT, s)), `thiếu file ${s}`);
});

test('index.html nạp toàn bộ js/app/*.js, core.js đứng đầu', () => {
  const appFiles = fs.readdirSync(path.join(ROOT, 'js/app')).filter((f) => f.endsWith('.js'));
  const loaded = localScripts.filter((s) => s.startsWith('js/app/')).map((s) => s.slice(7));
  assert.deepEqual([...loaded].sort(), [...appFiles].sort());
  assert.equal(loaded[0], 'core.js');
  // helpers phải nạp trước app
  const idx = (f) => localScripts.indexOf(f);
  assert.ok(idx('auth-helpers.js') < idx('js/app/core.js'));
  assert.ok(idx('utils/batch-fetch.js') < idx('js/app/core.js'));
});

test('mọi file JS local đều parse được (classic script)', () => {
  for (const s of localScripts) {
    const code = fs.readFileSync(path.join(ROOT, s), 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: s }), s);
  }
});

test('mọi rrtShared.X được dùng đều có file đăng ký', () => {
  const files = fs
    .readdirSync(path.join(ROOT, 'js/app'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(ROOT, 'js/app', f));
  const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const provided = new Set([
    ...[...src.matchAll(/^\s*rrtShared\.(\w+)\s*=/gm)].map((m) => m[1]),
    ...[...src.matchAll(/Object\.defineProperty\(rrtShared, '(\w+)'/g)].map((m) => m[1]),
  ]);
  const used = new Set([...src.matchAll(/rrtShared\.(\w+)/g)].map((m) => m[1]));
  for (const u of used) assert.ok(provided.has(u), `rrtShared.${u} được dùng nhưng không file nào đăng ký`);
});

test("onclick/on*=\"...'${x}'...\" phải bọc jsAttr() (utils/escape.js)", () => {
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'js/app')).filter((f) => f.endsWith('.js')).map((f) => 'js/app/' + f),
    ...fs.readdirSync(ROOT).filter((f) => /^(lab-.*|team-response-stats|huong-dan-engine)\.js$/.test(f)),
  ];
  const bad = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of s.matchAll(/\son[a-z]+="[^"]*?'\$\{(?!\s*jsAttr\()/g)) {
      bad.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('thư viện CDN: cố định phiên bản; file từ jsdelivr/unpkg/code.jquery có SRI', () => {
  for (const page of ['index.html', 'huong-dan.html', 'rehearsal.html']) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tags = [...src.matchAll(/<(script|link)\b[^>]*?(?:src|href)="(https:\/\/[^"]+)"[^>]*>/g)];
    for (const [tag, , url] of tags) {
      if (!/\.(js|css)(\?|$)/.test(url)) continue;
      assert.doesNotMatch(url, /latest|@\d+(\/|"|$)|unpkg\.com\/[^@/]+\/|\/maps\/(highmaps|modules)/, `${page}: chưa cố định phiên bản: ${url}`);
      if (/cdn\.jsdelivr\.net\/npm\/|unpkg\.com\/|code\.jquery\.com\/(jquery-|ui\/[\d.]+\/jquery-ui\.min\.js)/.test(url)) {
        assert.match(tag, /integrity="sha(256|384)-[A-Za-z0-9+/=]+"/, `${page}: thiếu SRI: ${url}`);
        assert.match(tag, /crossorigin="anonymous"/, `${page}: thiếu crossorigin: ${url}`);
      }
    }
  }
});

test("lab_dispatch_log: không select('*') / .select() — cột action_token bị ẩn", () => {
  // migration 20260929040000_rrt_hide_dispatch_token.sql: tài khoản đăng nhập
  // không có quyền đọc action_token, nên select('*') (và .select() rỗng sau
  // insert) sẽ bị lỗi quyền. Phải liệt kê cột.
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'js/app')).map((f) => 'js/app/' + f),
    ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')),
  ].filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/from\(\s*['"]lab_dispatch_log['"]\s*\)/g)) {
      // xét chuỗi lệnh đến dấu ';' kế tiếp
      const stmt = src.slice(m.index, src.indexOf(';', m.index));
      assert.ok(
        !/\.select\(\s*\)/.test(stmt) && !/\.select\(\s*['"`]\s*\*/.test(stmt),
        `${f}: truy vấn lab_dispatch_log dùng select('*') hoặc .select() rỗng`
      );
    }
  }
});

test('trang kết quả email/PXN: không gán thẳng tham số URL vào innerHTML', () => {
  // response.html / lab-result.html cùng origin với webapp (chung phiên đăng nhập
  // trong localStorage) — link giả mạo ?msg=<img onerror=...> sẽ chiếm được phiên.
  for (const page of ['response.html', 'lab-result.html']) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.doesNotMatch(src, /innerHTML\s*=\s*msgText/, `${page}: innerHTML = msgText`);
    assert.match(src, /innerHTML\s*=\s*safeMsg\(msgText\)/, `${page}: thiếu safeMsg()`);
  }
});

test('không còn liên kết về địa chỉ cũ hcdc-ap.github.io/RRT/ (404)', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  for (const p of pages) {
    const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
    assert.doesNotMatch(src, /hcdc-ap\.github\.io\/RRT\//, `${p}: liên kết hcdc-ap.github.io/RRT/ không tồn tại`);
  }
});
