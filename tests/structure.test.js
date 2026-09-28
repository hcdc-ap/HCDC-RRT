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
  for (const page of ['index.html', 'huong-dan.html']) {
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
