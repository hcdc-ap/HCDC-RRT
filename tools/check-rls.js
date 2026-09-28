#!/usr/bin/env node
// Kiểm tra PHÂN QUYỀN DỮ LIỆU (RLS) với Supabase THẬT: đăng nhập bằng một tài khoản,
// đọc thẳng từng bảng qua REST API (bỏ qua giao diện/menu, giống cách kẻ xấu làm)
// và kiểm tra tài khoản đó KHÔNG đọc được dữ liệu ngoài phạm vi.
// CHỈ ĐỌC — không ghi/sửa/xóa gì.
//
//   RRT_TEST_EMAIL=... RRT_TEST_PASSWORD=... npm run check:rls
//   npm run check:rls                 # chỉ kiểm tra khách chưa đăng nhập (anon)
//
// Mỗi lần chạy kiểm tra: khách chưa đăng nhập (anon) + tài khoản được cung cấp.
// Chạy lần lượt với tài khoản nhân viên (user), tuyến cơ sở (ward_admin), và
// NÊN có một tài khoản vừa tự đăng ký, CHƯA duyệt (pending) — nhóm nguy hiểm nhất.
//
// Kết quả:
//   ✗ FAIL  đọc được dữ liệu chắc chắn ngoài phạm vi (ví dụ hồ sơ người khác)
//   ! WARN  bảng MỌI tài khoản đăng nhập đều đọc được — cần quyết định có chấp nhận không
// Ngoài ra liệt kê (theo file schema trong supabase/migrations) các bảng mà mọi
// tài khoản đăng nhập đều GHI/XÓA được — phần này không gọi mạng.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(ROOT, 'js/app/core.js'), 'utf8');
const URL_ = core.match(/SUPABASE_URL = '([^']+)'/)[1];
const ANON = process.env.SUPABASE_ANON_KEY || core.match(/SUPABASE_ANON_KEY =\s*'([^']+)'/)[1];
const { RRT_TEST_EMAIL: EMAIL, RRT_TEST_PASSWORD: PASSWORD } = process.env;

// ---- Đọc schema: danh sách bảng + policy ----
const migDir = path.join(ROOT, 'supabase/migrations');
const schema = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => fs.readFileSync(path.join(migDir, f), 'utf8'))
  .join('\n');
const TABLES = [...new Set([...schema.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)"/g)].map((m) => m[1]))]
  .filter((t) => t !== 'spatial_ref_sys'); // bảng hệ thống PostGIS
// Policy bị DROP ở migration sau (theo thứ tự trong file ghép) thì không còn hiệu lực.
const DROPS = [...schema.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON "public"\."(\w+)"/g)].map((m) => ({
  key: `${m[2]}.${m[1]}`,
  at: m.index,
}));
const POLICIES = [...schema.matchAll(/CREATE POLICY "([^"]+)" ON "public"\."(\w+)" AS PERMISSIVE FOR (\w+) TO (\w+)(.*?);\n/gs)]
  .filter((m) => !DROPS.some((d) => d.key === `${m[2]}.${m[1]}` && d.at > m.index))
  .map((m) => ({ name: m[1], table: m[2], cmd: m[3], to: m[4], body: m[5].replace(/\s+/g, ' ') }));
// Policy mở cho mọi người: USING (true) / WITH CHECK (true)
const openFor = (cmds) =>
  new Set(
    POLICIES.filter(
      (p) => cmds.includes(p.cmd) && /(USING|WITH CHECK) \(true\)/.test(p.body) && !/USING \((?!true)/.test(p.body)
    ).map((p) => p.table)
  );
const OPEN_READ = openFor(['SELECT', 'ALL']);
const OPEN_WRITE = openFor(['ALL', 'INSERT', 'UPDATE', 'DELETE']);
// Migration phân quyền theo vai trò đã thay policy của các bảng RRT này
// (kiểm tra chi tiết quyền ghi: npm run test:rls).
const HAS_ROLE_MIGRATION = /rrt_rls_roles/.test(fs.readdirSync(migDir).join(' '));
const SCOPED_BY_ROLE = new Set([
  'incidents', 'incident_logs', 'incident_reports', 'incident_plans', 'incident_assessments',
  'incident_objectives', 'incident_activities', 'incident_logistics', 'deployment_history',
  'notifications', 'roster_schedules', 'roster_assignments', 'rrt_qualifications',
]);

// Bảng CÔNG KHAI có chủ đích (khách chưa đăng nhập được đọc)
const PUBLIC_OK = new Set(['website_stats']);

let fails = 0;
let warns = 0;
const fail = (msg) => (fails++, console.log(`  ✗ FAIL  ${msg}`));
const warn = (msg) => (warns++, console.log(`  ! WARN  ${msg}`));
const ok = (msg) => console.log(`  ✓       ${msg}`);

async function api(token, pathAndQuery, extraHeaders = {}) {
  const res = await fetch(`${URL_}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, Prefer: 'count=exact', ...extraHeaders },
  });
  const count = Number((res.headers.get('content-range') || '').split('/')[1]);
  // 206 = PostgREST trả một phần (bảng có nhiều dòng hơn limit) — vẫn là đọc được.
  const body = res.ok ? await res.json().catch(() => []) : await res.text();
  return { status: res.status, count: Number.isFinite(count) ? count : null, rows: Array.isArray(body) ? body : [], body };
}

// Đếm số dòng đọc được của mọi bảng
async function countAll(token) {
  const out = {};
  await Promise.all(
    TABLES.map(async (t) => {
      const r = await api(token, `${t}?select=*&limit=1`);
      out[t] = r.status === 200 || r.status === 206 ? r.count ?? r.rows.length : `HTTP ${r.status}`;
    })
  );
  return out;
}

async function checkAnon() {
  console.log('\n=== Khách CHƯA đăng nhập (chỉ có anon key công khai trong code) ===');
  const counts = await countAll(ANON);
  let leaked = 0;
  for (const t of TABLES) {
    const n = counts[t];
    if (typeof n === 'number' && n > 0 && !PUBLIC_OK.has(t)) {
      leaked++;
      fail(`${t}: đọc được ${n} dòng khi CHƯA đăng nhập`);
    }
  }
  if (!leaked) ok('không đọc được bảng nào ngoài bảng công khai');
}

async function checkUser() {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const auth = await r.json();
  if (!auth.access_token) {
    console.error(`\nĐăng nhập thất bại (${EMAIL}): ${auth.error_description || auth.msg || r.status}`);
    process.exitCode = 2;
    return;
  }
  const token = auth.access_token;
  const uid = auth.user.id;
  const me = (await api(token, `profiles?id=eq.${uid}&select=*`)).rows[0] || {};
  const role = String(me.role || 'user').toLowerCase();
  const status = me.registration_status || me.approval_status || '?';
  console.log(`\n=== ${EMAIL} — role=${role}, trạng thái=${status}, ma_xa=${me.workplace_ma_xa || '-'} ===`);

  if (['admin', 'super_admin'].includes(role)) {
    console.log('  (Quản trị: được xem toàn bộ — chỉ in số dòng để tham khảo)');
    const counts = await countAll(token);
    for (const t of TABLES) console.log(`          ${t}: ${counts[t]}`);
    return;
  }

  const counts = await countAll(token);
  const pending = ['pending', 'rejected'].includes(String(status).toLowerCase());

  // 1. Tài khoản CHƯA duyệt: không được đọc gì ngoài hồ sơ của chính mình
  if (pending) {
    let leaked = 0;
    for (const t of TABLES) {
      const n = counts[t];
      if (typeof n !== 'number' || n === 0 || PUBLIC_OK.has(t)) continue;
      if (t === 'profiles' && n === 1) continue;
      leaked++;
      fail(`${t}: tài khoản CHƯA DUYỆT đọc được ${n} dòng`);
    }
    if (!leaked) ok('tài khoản chưa duyệt không đọc được dữ liệu nào');
  }

  // 2. Hồ sơ cá nhân (profiles)
  const profiles = (await api(token, 'profiles?select=id,email,role,workplace_ma_xa,fax&limit=5000')).rows;
  const wardFax = ['trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu'];
  const inMyWard = (p) =>
    role === 'ward_admin' &&
    me.workplace_ma_xa &&
    p.workplace_ma_xa === me.workplace_ma_xa &&
    wardFax.includes(String(p.fax || '').trim().toLowerCase());
  const badProfiles = profiles.filter((p) => p.id !== uid && !inMyWard(p));
  if (badProfiles.length)
    fail(`profiles: đọc được ${badProfiles.length} hồ sơ người khác ngoài phạm vi (vd: ${badProfiles.slice(0, 3).map((p) => p.email).join(', ')})`);
  else ok(`profiles: chỉ thấy ${role === 'ward_admin' ? 'mình + người trong phường/xã' : 'hồ sơ của mình'} (${profiles.length} dòng)`);

  // 3. Sự kiện (incidents): chỉ sự kiện mình được điều động, hoặc thuộc phường/xã mình (ward_admin)
  const incidents = (await api(token, 'incidents?select=id,ma_xa,members,initial_selected_members&limit=5000')).rows;
  const email = String(me.email || EMAIL).toLowerCase();
  const isMember = (i) =>
    `;${i.members || ''};${i.initial_selected_members || ''};`.toLowerCase().includes(`;${email};`);
  const badInc = incidents.filter(
    (i) => !isMember(i) && !(role === 'ward_admin' && me.workplace_ma_xa && i.ma_xa === me.workplace_ma_xa)
  );
  if (badInc.length) fail(`incidents: đọc được ${badInc.length} sự kiện không liên quan (id: ${badInc.slice(0, 5).map((i) => i.id).join(', ')})`);
  else ok(`incidents: chỉ thấy sự kiện liên quan (${incidents.length} dòng)`);

  // 4. Hồ sơ đào tạo (training_records): của mình, hoặc học viên trong phường/xã (ward_admin)
  const tr = (await api(token, 'training_records?select=id,profile_id,user_id&limit=5000')).rows;
  const visibleIds = new Set(profiles.filter(inMyWard).map((p) => p.id));
  const badTr = tr.filter((x) => {
    const who = x.profile_id || x.user_id;
    return who !== uid && !visibleIds.has(who);
  });
  if (badTr.length) fail(`training_records: đọc được ${badTr.length} hồ sơ đào tạo của người khác`);
  else ok(`training_records: chỉ thấy hồ sơ trong phạm vi (${tr.length} dòng)`);

  // 4b. Thông báo (notifications): của mình, hoặc của nhân sự trong phường/xã (ward_admin)
  const myWardEmails = new Set(profiles.filter(inMyWard).map((p) => String(p.email || '').toLowerCase()));
  const notif = (await api(token, 'notifications?select=user_email&limit=5000')).rows;
  const badNotif = notif.filter((n) => {
    const e = String(n.user_email || '').toLowerCase();
    return e !== email && e !== uid && !myWardEmails.has(e);
  });
  if (badNotif.length)
    fail(`notifications: đọc được ${badNotif.length} thông báo của người khác (kèm action_token xác nhận qua email) — chưa áp migration 20260929000000_rrt_rls_roles?`);
  else ok(`notifications: chỉ thấy thông báo trong phạm vi (${notif.length} dòng)`);

  // 5. Dữ liệu LIMS (phòng xét nghiệm) — tài khoản RRT không phải quản trị không được đọc
  const lims = TABLES.filter(
    (t) => /^(lims_|lab_inventory|lab_equipments|inventory_transactions)/.test(t) && !OPEN_READ.has(t)
  );
  const badLims = lims.filter((t) => typeof counts[t] === 'number' && counts[t] > 0);
  if (badLims.length) fail(`LIMS: đọc được ${badLims.map((t) => `${t}(${counts[t]})`).join(', ')}`);
  else ok(`LIMS: không đọc được ${lims.length} bảng riêng của phòng xét nghiệm`);

  // 6. Bảng mở cho MỌI tài khoản đăng nhập — cần quyết định nghiệp vụ
  const wide = [...OPEN_READ].filter(
    (t) =>
      TABLES.includes(t) &&
      !(HAS_ROLE_MIGRATION && SCOPED_BY_ROLE.has(t)) &&
      typeof counts[t] === 'number' &&
      counts[t] > 0
  );
  if (wide.length) {
    warn(
      HAS_ROLE_MIGRATION
        ? 'Tài khoản này đọc được TOÀN BỘ các bảng dùng chung sau (đúng nếu là danh mục/kho/thư viện):'
        : 'Mọi tài khoản đăng nhập (kể cả vừa tự đăng ký) đều đọc được TOÀN BỘ các bảng sau:'
    );
    for (const t of wide.sort()) console.log(`            - ${t}: ${counts[t]} dòng`);
  }
}

function staticWriteReport() {
  if (HAS_ROLE_MIGRATION) {
    console.log('\n(Quyền ghi theo vai trò: kiểm tra bằng npm run test:rls trên Postgres cục bộ)');
    return;
  }
  const tables = [...OPEN_WRITE].filter((t) => TABLES.includes(t)).sort();
  if (!tables.length) return;
  console.log('\n=== Theo file schema: MỌI tài khoản đăng nhập đều GHI/SỬA/XÓA được (không gọi mạng) ===');
  for (const t of tables) {
    const cmds = [...new Set(POLICIES.filter((p) => p.table === t && /(USING|WITH CHECK) \(true\)/.test(p.body)).map((p) => p.cmd))];
    warn(`${t} (${cmds.join(', ')})`);
  }
}

(async () => {
  console.log(`Supabase: ${URL_.replace(/\/\/[^.]+/, '//***')} — ${TABLES.length} bảng`);
  await checkAnon();
  if (EMAIL && PASSWORD) await checkUser();
  else console.log('\n(Chưa có RRT_TEST_EMAIL/RRT_TEST_PASSWORD — chỉ kiểm tra anon)');
  staticWriteReport();
  console.log(`\nTổng: ${fails} FAIL, ${warns} WARN`);
  if (fails && !process.exitCode) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
