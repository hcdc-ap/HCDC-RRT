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
  // helpers phải nạp trước app, fix-patches phải nạp sau app
  const idx = (f) => localScripts.indexOf(f);
  assert.ok(idx('auth-helpers.js') < idx('js/app/core.js'));
  assert.ok(idx('utils/batch-fetch.js') < idx('js/app/core.js'));
  assert.ok(idx('fix-patches.js') > idx('js/app/misc.js'));
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
