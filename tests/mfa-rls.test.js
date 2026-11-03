// Kiểm thử migration MFA + nhật ký truy cập (20261103000000_rrt_mfa_audit.sql) trên
// Postgres nhúng (pglite) với schema Supabase giả lập tối thiểu. KHÔNG chạm database thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ADMIN = '00000000-0000-0000-0000-0000000000a1';
const PLAIN = '00000000-0000-0000-0000-0000000000b1'; // chưa bật MFA
const MFA = '00000000-0000-0000-0000-0000000000c1'; // đã bật MFA

let db;

async function as(uid, aal) {
  await db.exec('RESET ROLE');
  const claims = JSON.stringify({ sub: uid, role: 'authenticated', aal });
  await db.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
  await db.exec('SET ROLE authenticated');
}
async function asSuper() {
  await db.exec('RESET ROLE');
}
async function denied(sql) {
  try {
    const r = await db.query(sql);
    return (r.affectedRows ?? r.rows.length) === 0;
  } catch {
    return true;
  }
}

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(read('supabase/tests/supabase_stubs.sql'));
  await db.exec(`
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text, role text, approval_status text);
    CREATE TABLE public.secret_data (id serial PRIMARY KEY, owner uuid, note text);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.secret_data ENABLE ROW LEVEL SECURITY;
    CREATE POLICY p_all ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    -- Giống p_ward_update thật: WITH CHECK tự truy vấn lại profiles (từng gây infinite recursion với cổng bọc SELECT)
    CREATE FUNCTION public.current_user_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
    CREATE POLICY p_ward_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
      USING (current_user_role() = 'ward_admin')
      WITH CHECK (current_user_role() = 'ward_admin' AND (role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id)));
    CREATE POLICY s_all ON public.secret_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.secret_data TO authenticated;
    GRANT USAGE ON SEQUENCE public.secret_data_id_seq TO authenticated;
    CREATE FUNCTION public.rrt_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND lower(role) = 'admin') $$;
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}','a@x'),('${PLAIN}','b@x'),('${MFA}','c@x');
    INSERT INTO public.profiles VALUES ('${ADMIN}','a@x','admin','approved'),('${PLAIN}','b@x','user','pending'),('${MFA}','c@x','user','approved');
    INSERT INTO public.secret_data (owner, note) VALUES ('${PLAIN}','x'),('${MFA}','y');
    INSERT INTO auth.mfa_factors (user_id, status) VALUES ('${MFA}','verified');
  `);
  await db.exec(read('supabase/migrations/20261103000000_rrt_mfa_audit.sql'));
});

test('người CHƯA bật MFA: đọc/ghi như cũ (aal1)', async () => {
  await as(PLAIN, 'aal1');
  assert.equal((await db.query('SELECT * FROM public.secret_data')).rows.length, 2);
  await db.query("INSERT INTO public.secret_data (owner, note) VALUES ('" + PLAIN + "','z')");
});

test('người ĐÃ bật MFA nhưng phiên aal1: bị chặn đọc và ghi', async () => {
  await as(MFA, 'aal1');
  assert.equal((await db.query('SELECT * FROM public.secret_data')).rows.length, 0);
  assert.ok(await denied("INSERT INTO public.secret_data (owner, note) VALUES ('" + MFA + "','hack')"));
  assert.ok(await denied('UPDATE public.secret_data SET note = \'hack\''));
});

test('người đã bật MFA và phiên aal2: đọc/ghi bình thường', async () => {
  await as(MFA, 'aal2');
  assert.ok((await db.query('SELECT * FROM public.secret_data')).rows.length >= 2);
  await db.query("INSERT INTO public.secret_data (owner, note) VALUES ('" + MFA + "','ok')");
});

test('factor chưa xác minh (unverified) không bị coi là đã bật MFA', async () => {
  await asSuper();
  await db.exec(`UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = '${MFA}'`);
  await as(MFA, 'aal1');
  assert.ok((await db.query('SELECT * FROM public.secret_data')).rows.length >= 2);
  await asSuper();
  await db.exec(`UPDATE auth.mfa_factors SET status = 'verified' WHERE user_id = '${MFA}'`);
});

test('cổng MFA có trên mọi bảng RLS của public (kể cả bảng mới của migration)', async () => {
  await asSuper();
  const r = await db.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'rrt_mfa_gate')`);
  assert.deepEqual(r.rows, []);
});

test('HỒI QUY: sửa hồ sơ (profiles có policy tự truy vấn lại) không bị infinite recursion', async () => {
  await as(PLAIN, 'aal1');
  const r = await db.query("UPDATE public.profiles SET email = 'b@x' WHERE id = '" + PLAIN + "'");
  assert.equal(r.affectedRows, 1);
  await as(MFA, 'aal2');
  assert.equal((await db.query("UPDATE public.profiles SET email = 'c@x' WHERE id = '" + MFA + "'")).affectedRows, 1);
  await as(MFA, 'aal1'); // đã bật MFA nhưng chưa qua bước 2: bị chặn (0 dòng), không phải lỗi recursion
  assert.equal((await db.query("UPDATE public.profiles SET email = 'c@x' WHERE id = '" + MFA + "'")).affectedRows, 0);
});

test('nhật ký: ghi qua rrt_log_event, user_id lấy từ phiên', async () => {
  await as(PLAIN, 'aal1');
  await db.query("SELECT public.rrt_log_event('login_success', '{}'::jsonb)");
  await asSuper();
  const r = await db.query("SELECT user_id, email, event, success FROM public.rrt_access_log WHERE event='login_success'");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].user_id, PLAIN);
  assert.equal(r.rows[0].email, 'b@x');
});

test('nhật ký: sự kiện ngoài danh sách hoặc chưa đăng nhập bị từ chối', async () => {
  await as(PLAIN, 'aal1');
  assert.ok(await denied("SELECT public.rrt_log_event('mfa_admin_reset', '{}'::jsonb)"));
  assert.ok(await denied("SELECT public.rrt_log_event('hack', '{}'::jsonb)"));
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims', '{}', false)");
  await db.exec('SET ROLE authenticated');
  assert.ok(await denied("SELECT public.rrt_log_event('login_success', '{}'::jsonb)"));
});

test('nhật ký: người thường không đọc được, admin đọc được', async () => {
  await as(PLAIN, 'aal1');
  assert.equal((await db.query('SELECT * FROM public.rrt_access_log')).rows.length, 0);
  await as(ADMIN, 'aal1');
  assert.ok((await db.query('SELECT * FROM public.rrt_access_log')).rows.length >= 1);
});

test('nhật ký: không INSERT trực tiếp, không UPDATE/DELETE (kể cả admin và service)', async () => {
  await as(ADMIN, 'aal1');
  assert.ok(await denied("INSERT INTO public.rrt_access_log (event) VALUES ('x')"));
  assert.ok(await denied('UPDATE public.rrt_access_log SET event = \'x\''));
  assert.ok(await denied('DELETE FROM public.rrt_access_log'));
  await asSuper();
  await assert.rejects(db.exec("UPDATE public.rrt_access_log SET event = 'x'"));
  await assert.rejects(db.exec('DELETE FROM public.rrt_access_log'));
  await assert.rejects(db.exec('TRUNCATE public.rrt_access_log'));
});

test('nhật ký: duyệt tài khoản và bật/tắt MFA tự ghi bằng trigger', async () => {
  await as(ADMIN, 'aal1');
  await db.exec(`UPDATE public.profiles SET approval_status = 'approved' WHERE id = '${PLAIN}'`);
  await asSuper();
  await db.exec(`UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = '${MFA}'`);
  await db.exec(`UPDATE auth.mfa_factors SET status = 'verified' WHERE user_id = '${MFA}'`);
  await db.exec(`DELETE FROM auth.mfa_factors WHERE user_id = '${MFA}'`);
  await db.exec(`UPDATE auth.users SET encrypted_password = 'h2' WHERE id = '${PLAIN}'`);
  const ev = (await db.query('SELECT event FROM public.rrt_access_log ORDER BY id')).rows.map((r) => r.event);
  for (const e of ['account_approved', 'mfa_enabled', 'mfa_disabled', 'password_changed']) {
    assert.ok(ev.includes(e), 'thiếu sự kiện ' + e);
  }
});

test('bảng mã dự phòng / đếm thử: người dùng không truy cập được', async () => {
  await as(PLAIN, 'aal2');
  assert.ok(await denied('SELECT * FROM public.rrt_mfa_backup_codes'));
  assert.ok(await denied('SELECT * FROM public.rrt_mfa_attempts'));
});

test('rollback gỡ sạch và chạy lại được migration (idempotent)', async () => {
  await asSuper();
  await db.exec(read('supabase/migrations/rollback/20261103000000_rrt_mfa_audit_down.sql'));
  const g = await db.query("SELECT count(*)::int n FROM pg_policy WHERE polname = 'rrt_mfa_gate'");
  assert.equal(g.rows[0].n, 0);
  const t = await db.query("SELECT to_regclass('public.rrt_access_log') AS t");
  assert.equal(t.rows[0].t, null);
  await db.exec(read('supabase/migrations/20261103000000_rrt_mfa_audit.sql'));
  await db.exec(read('supabase/migrations/20261103000000_rrt_mfa_audit.sql'));
});
