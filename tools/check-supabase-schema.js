#!/usr/bin/env node
// Đối chiếu các bảng/cột mà frontend dùng với database Supabase THẬT.
// CHỈ ĐỌC: mỗi truy vấn là GET ...?select=<cột>&limit=0 — không đọc/ghi dữ liệu.
//
//   npm run check:schema                       # dùng anon key trong js/app/core.js
//   RRT_TEST_EMAIL=... RRT_TEST_PASSWORD=... npm run check:schema   # đăng nhập (qua RLS)
//   npm run check:schema -- --list             # chỉ liệt kê, không gọi mạng
//
// Tìm ra: tên bảng/cột sai trong .select(...) và trong payload .insert/.update/
// .upsert (object literal), quan hệ (foreign key) sai trong select lồng nhau,
// và RPC chưa tồn tại.
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'auth-helpers.js',
  'team-response-stats.js',
  ...fs.readdirSync(path.join(ROOT, 'js/app')).filter((f) => f.endsWith('.js')).map((f) => 'js/app/' + f),
  ...fs.readdirSync(ROOT).filter((f) => /^lab-.*\.js$/.test(f)),
];

function literalString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

// Đi ngược chuỗi gọi a.from('t').select('x').eq(...) để tìm .from('t')
function findFromTable(node) {
  for (let n = node; n; ) {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
      if (n.callee.property.name === 'from') return literalString(n.arguments[0]);
      n = n.callee.object;
    } else if (n.type === 'MemberExpression') n = n.object;
    else if (n.type === 'AwaitExpression') n = n.argument;
    else return null;
  }
  return null;
}

function collect() {
  const uses = []; // {table, select, file, line}
  const rpcs = new Map(); // name -> [file:line]
  for (const file of FILES) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const ast = acorn.parse(src, { ecmaVersion: 2022, locations: true });
    walk.full(ast, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
      const method = node.callee.property.name;
      const where = `${file}:${node.loc.start.line}`;
      if (method === 'rpc') {
        const name = literalString(node.arguments[0]);
        if (name) rpcs.set(name, [...(rpcs.get(name) || []), where]);
        return;
      }
      const table = findFromTable(node.callee.object);
      if (!table) return;
      if (method === 'select') {
        const cols = node.arguments.length ? literalString(node.arguments[0]) : '*';
        if (cols) uses.push({ table, select: cols.replace(/\s+/g, ''), where });
      } else if (['insert', 'update', 'upsert'].includes(method)) {
        let obj = node.arguments[0];
        if (obj && obj.type === 'ArrayExpression') obj = obj.elements[0];
        if (obj && obj.type === 'ObjectExpression') {
          const keys = obj.properties
            .filter((p) => p.type === 'Property' && !p.computed)
            .map((p) => p.key.name || p.key.value);
          if (keys.length) uses.push({ table, select: keys.join(','), where, write: method });
        }
      }
    });
  }
  return { uses, rpcs };
}

async function main() {
  const { uses, rpcs } = collect();
  // gộp theo (bảng, select)
  const uniq = new Map();
  for (const u of uses) {
    const k = u.table + '?' + u.select;
    if (!uniq.has(k)) uniq.set(k, { ...u, wheres: [] });
    uniq.get(k).wheres.push(u.where);
  }
  if (process.argv.includes('--list')) {
    for (const u of uniq.values()) console.log(`${u.table}  select=${u.select}  (${u.wheres[0]}${u.wheres.length > 1 ? ` +${u.wheres.length - 1}` : ''})`);
    console.log(`\n${uniq.size} truy vấn khác nhau trên ${new Set(uses.map((u) => u.table)).size} bảng; RPC: ${[...rpcs.keys()].join(', ')}`);
    return;
  }

  const core = fs.readFileSync(path.join(ROOT, 'js/app/core.js'), 'utf8');
  const URL_ = process.env.SUPABASE_URL || core.match(/SUPABASE_URL = '([^']+)'/)[1];
  const ANON = process.env.SUPABASE_ANON_KEY || core.match(/SUPABASE_ANON_KEY =\s*'([^']+)'/)[1];
  let token = ANON;
  if (process.env.RRT_TEST_EMAIL) {
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.RRT_TEST_EMAIL, password: process.env.RRT_TEST_PASSWORD }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error('Đăng nhập thất bại: ' + JSON.stringify(j));
    token = j.access_token;
    console.log(`Đăng nhập: ${process.env.RRT_TEST_EMAIL}`);
  } else console.log('Dùng anon key (bảng bị RLS/quyền chặn sẽ báo "không kiểm tra được").');

  const headers = { apikey: ANON, Authorization: `Bearer ${token}` };
  let bad = 0, unknown = 0;
  for (const u of uniq.values()) {
    const res = await fetch(`${URL_}/rest/v1/${u.table}?select=${encodeURIComponent(u.select)}&limit=0`, { headers });
    if (res.ok) continue;
    const body = await res.json().catch(() => ({}));
    const msg = `${u.table} select=${u.select}\n    → ${res.status} ${body.code || ''} ${body.message || ''}\n    tại ${u.wheres.join(', ')}`;
    // 42501/401 = không có quyền đọc (không kết luận được về cột)
    if (res.status === 401 || body.code === '42501') { unknown++; console.log('? ' + msg); }
    else { bad++; console.log('✗ ' + msg); }
  }

  // RPC: đọc OpenAPI của PostgREST (nếu project cho phép)
  const spec = await fetch(`${URL_}/rest/v1/`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  for (const [name, wheres] of rpcs) {
    if (!spec) { unknown++; console.log(`? RPC ${name}: không đọc được OpenAPI để kiểm tra (${wheres[0]})`); continue; }
    if (!spec.paths?.[`/rpc/${name}`]) { bad++; console.log(`✗ RPC ${name} không tồn tại (${wheres.join(', ')})`); }
  }

  console.log(`\nĐã kiểm tra ${uniq.size} truy vấn + ${rpcs.size} RPC: ${bad} lỗi, ${unknown} không kiểm tra được.`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 2;
});
