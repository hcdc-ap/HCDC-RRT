// Kiểm thử RLS bảng notifications trên PostgreSQL thật chạy trong bộ nhớ (PGlite),
// hoàn toàn tách khỏi Supabase. Định nghĩa bảng, hàm phân quyền và policy cũ được
// lấy NGUYÊN VĂN từ file schema; migration mới được áp đúng như sẽ chạy thật.
// Mỗi kịch bản mô phỏng đúng truy vấn mà app đang gửi (ghi chú file:dòng).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const MIG = path.join(__dirname, '..', 'supabase', 'migrations');
const SCHEMA = fs.readFileSync(path.join(MIG, '20260928000000_remote_schema.sql'), 'utf8');
const NEW_MIGRATION = fs.readFileSync(path.join(MIG, '20260929000000_restrict_notifications_rls.sql'), 'utf8');

function extract(re, what) {
  const m = SCHEMA.match(re);
  assert.ok(m, `không tìm thấy ${what} trong schema`);
  return m[0];
}
const fn = (name) =>
  extract(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`), `hàm ${name}`);
const policy = (name, table) =>
  extract(new RegExp(`CREATE POLICY "${name}" ON "public"\\."${table}"[\\s\\S]*?;\\n`), `policy ${name}`);

const WARD = '70145129';
const TYT = 'Trạm Y tế Phường/Xã/ Đặc khu';
const U = {
  admin: { id: '00000000-0000-0000-0000-00000000000a', email: 'admin@test.vn', role: 'admin', ma_xa: null, fax: 'HCDC' },
  ward: { id: '00000000-0000-0000-0000-00000000000b', email: 'ward@test.vn', role: 'ward_admin', ma_xa: WARD, fax: TYT },
  u1: { id: '00000000-0000-0000-0000-000000000001', email: 'u1@test.vn', role: 'user', ma_xa: WARD, fax: TYT },
  u2: { id: '00000000-0000-0000-0000-000000000002', email: 'u2@test.vn', role: 'user', ma_xa: '99999999', fax: TYT },
  u3: { id: '00000000-0000-0000-0000-000000000003', email: 'u3@test.vn', role: 'user', ma_xa: null, fax: 'HCDC' },
};
const INCIDENT = '11111111-1111-1111-1111-111111111111';

async function freshDb({ migrate }) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.email', true), '') $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;

    CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, role text, workplace_ma_xa text, fax text, "position" text);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ${extract(/CREATE TABLE IF NOT EXISTS "public"\."notifications" \([\s\S]*?\);/, 'bảng notifications')}
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    ${fn('current_user_role')}
    ${fn('current_user_workplace_ma_xa')}
    ${fn('row_in_my_ward')}
    ${policy('p_admin_all', 'profiles')}
    ${policy('p_self_select', 'profiles')}
    ${policy('p_ward_select', 'profiles')}
    ${policy('authenticated_full_access', 'notifications')}
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.notifications TO anon, authenticated;
  `);
  for (const u of Object.values(U)) {
    await db.query('INSERT INTO profiles VALUES ($1,$2,$3,$4,$5,$6)', [u.id, u.email, u.role, u.ma_xa, u.fax, null]);
  }
  // u1 lưu email khác hoa/thường để kiểm tra so khớp không phân biệt hoa thường
  const rows = [
    ['U1@Test.VN', 'khan_cap', INCIDENT],
    [U.u2.email, 'khan_cap', INCIDENT],
    [U.u3.email, 'truc_ban', null],
    [U.ward.email, 'thong_tin', null],
    [U.u1.email, 'ket_thuc', INCIDENT],
    [U.u2.email, 'ket_thuc', INCIDENT],
  ];
  for (const [email, type, inc] of rows) {
    await db.query('INSERT INTO notifications (user_email, message, notification_type, incident_id) VALUES ($1,$2,$3,$4)', [email, 'msg', type, inc]);
  }
  if (migrate) await db.exec(NEW_MIGRATION);
  return db;
}

// Chạy truy vấn với tư cách một tài khoản (như Supabase đặt JWT claims + role)
async function as(db, who, sql, params = []) {
  await db.exec('RESET ROLE');
  if (who === 'anon') {
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.email', '', false)");
    await db.exec('SET ROLE anon');
  } else {
    const u = U[who];
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)", [u.id, u.email]);
    await db.exec('SET ROLE authenticated');
  }
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('RESET ROLE');
  }
}
const emailsSeen = async (db, who) =>
  (await as(db, who, 'SELECT lower(user_email) AS e FROM notifications ORDER BY 1')).rows.map((r) => r.e);
const insertFor = (db, who, email) =>
  as(db, who, "INSERT INTO notifications (user_email, message, notification_type) VALUES ($1, 'x', 'thong_tin')", [email]);
const RLS_ERR = /row-level security/;

test('schema hiện tại: nhân viên đọc được thông báo của người khác và tạo được thông báo (lỗ hổng cần vá)', async () => {
  const db = await freshDb({ migrate: false });
  assert.strictEqual((await emailsSeen(db, 'u2')).length, 6);
  await insertFor(db, 'u2', U.u1.email); // không bị chặn
});

test('sau migration: khách chưa đăng nhập không đọc, không tạo được', async () => {
  const db = await freshDb({ migrate: true });
  assert.deepStrictEqual(await emailsSeen(db, 'anon'), []);
  await assert.rejects(insertFor(db, 'anon', U.u1.email), RLS_ERR);
});

test('sau migration: nhân viên chỉ thấy thông báo của mình, dùng được mọi luồng app', async () => {
  const db = await freshDb({ migrate: true });
  assert.deepStrictEqual(await emailsSeen(db, 'u1'), [U.u1.email, U.u1.email]);

  // core.js:747 — thông báo chưa đọc của mình (email lưu khác hoa/thường vẫn khớp qua .in identifiers ở tracking.js:906)
  const unread = await as(db, 'u1', 'SELECT id FROM notifications WHERE user_email = ANY($1) AND is_read = false', [[U.u1.email, 'U1@Test.VN', U.u1.id]]);
  assert.strictEqual(unread.rows.length, 2);

  // map.js:419 / tracking.js:78 — thời điểm đóng sự kiện: chỉ còn thấy của mình (vẫn đủ để tính)
  const closed = await as(db, 'u1', "SELECT incident_id FROM notifications WHERE notification_type = 'ket_thuc' AND incident_id = ANY($1)", [[INCIDENT]]);
  assert.strictEqual(closed.rows.length, 1);

  // incident-response.js:114 — đánh dấu đã đọc theo sự kiện
  const r1 = await as(db, 'u1', 'UPDATE notifications SET is_read = true WHERE incident_id = $1 AND user_email = $2 AND is_read = false', [INCIDENT, 'U1@Test.VN']);
  assert.strictEqual(r1.affectedRows, 1);

  // tracking.js:963 / 990 — đánh dấu đã đọc theo id: của mình được, của người khác không có tác dụng
  const [mine] = (await as(db, 'u1', 'SELECT id FROM notifications LIMIT 1')).rows;
  assert.strictEqual((await as(db, 'u1', 'UPDATE notifications SET is_read = true WHERE id = $1', [mine.id])).affectedRows, 1);
  const other = (await db.query('SELECT id FROM notifications WHERE user_email = $1 LIMIT 1', [U.u2.email])).rows[0];
  assert.strictEqual((await as(db, 'u1', 'UPDATE notifications SET is_read = true WHERE id = $1', [other.id])).affectedRows, 0);
  assert.strictEqual((await db.query('SELECT is_read FROM notifications WHERE id = $1', [other.id])).rows[0].is_read, false);

  // Không được chuyển thông báo của mình sang người khác, không tạo, không xóa
  await assert.rejects(as(db, 'u1', 'UPDATE notifications SET user_email = $1 WHERE id = $2', [U.u2.email, mine.id]), RLS_ERR);
  await assert.rejects(insertFor(db, 'u1', U.u2.email), RLS_ERR);
  assert.strictEqual((await as(db, 'u1', 'DELETE FROM notifications')).affectedRows, 0);
});

test('sau migration: nhân viên KHÔNG đọc được action_token của người khác', async () => {
  const db = await freshDb({ migrate: true });
  const tokens = await as(db, 'u3', 'SELECT action_token FROM notifications WHERE user_email <> $1', [U.u3.email]);
  assert.strictEqual(tokens.rows.length, 0);
});

test('sau migration: quản trị tuyến cơ sở thấy thông báo của mình + nhân sự trong xã, tạo được thông báo', async () => {
  const db = await freshDb({ migrate: true });
  assert.deepStrictEqual(await emailsSeen(db, 'ward'), [U.u1.email, U.u1.email, U.ward.email]);
  // misc.js:613, roster.js:717/1370, shell.js:103, lab-dispatch-actions.js:275 — insert KHÔNG kèm select
  await insertFor(db, 'ward', U.u1.email);
  await insertFor(db, 'ward', U.u2.email); // vd. đóng sự kiện có thành viên ngoài xã: vẫn phải gửi được
  const n = (await db.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n;
  assert.strictEqual(n, 8);
  // Không sửa/xóa được thông báo của người khác
  assert.strictEqual((await as(db, 'ward', 'UPDATE notifications SET is_read = true WHERE user_email <> $1', [U.ward.email])).affectedRows, 0);
  assert.strictEqual((await as(db, 'ward', 'DELETE FROM notifications')).affectedRows, 0);
});

test('sau migration: quản trị HCDC xem, tạo, sửa, xóa toàn bộ', async () => {
  const db = await freshDb({ migrate: true });
  assert.strictEqual((await emailsSeen(db, 'admin')).length, 6);
  await insertFor(db, 'admin', U.u3.email);
  assert.strictEqual((await as(db, 'admin', 'UPDATE notifications SET is_read = true')).affectedRows, 7);
  assert.strictEqual((await as(db, 'admin', "DELETE FROM notifications WHERE notification_type = 'thong_tin'")).affectedRows, 2);
});

test('migration chạy lại lần 2 không lỗi và không đổi dữ liệu', async () => {
  const db = await freshDb({ migrate: true });
  const before = (await db.query('SELECT id, user_email, is_read FROM notifications ORDER BY id')).rows;
  await db.exec(NEW_MIGRATION);
  const after = (await db.query('SELECT id, user_email, is_read FROM notifications ORDER BY id')).rows;
  assert.deepStrictEqual(after, before);
  const pols = (await db.query("SELECT policyname FROM pg_policies WHERE tablename = 'notifications' ORDER BY 1")).rows.map((r) => r.policyname);
  assert.deepStrictEqual(pols, ['notif_delete_admin', 'notif_insert_admins', 'notif_select_scoped', 'notif_update_recipient_or_admin']);
});
