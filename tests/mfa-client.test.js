const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserEnv } = require('./helpers/browser-env');

function setup(sb) {
  const env = createBrowserEnv();
  env.load('mfa-helpers.js');
  env.window.supabaseClient = sb;
  env.window.rrtShared = {};
  env.load('js/app/mfa.js');
  return env.window;
}

test('logEvent: lỗi mạng/RPC không ném lỗi (không làm hỏng đăng nhập)', async () => {
  const w = setup({ rpc: () => Promise.reject(new Error('mạng đứt')) });
  await assert.doesNotReject(w.rrtMfa.logEvent('login_success'));
  const w2 = setup({ rpc: () => { throw new Error('sync'); } });
  await assert.doesNotReject(w2.rrtMfa.logEvent('logout'));
});

test('logEvent: gọi đúng RPC rrt_log_event với tên sự kiện', async () => {
  let call;
  const w = setup({ rpc: (n, a) => ((call = [n, a]), Promise.resolve({})) });
  await w.rrtMfa.logEvent('logout', { a: 1 });
  assert.equal(JSON.stringify(call), JSON.stringify(['rrt_log_event', { p_event: 'logout', p_detail: { a: 1 } }]));
});

test('logLoginFailed: không ném lỗi dù functions.invoke lỗi hoặc không tồn tại', () => {
  setup({ functions: { invoke: () => Promise.reject(new Error('x')) } }).rrtMfa.logLoginFailed('a@b.c');
  setup({}).rrtMfa.logLoginFailed('a@b.c');
});

test('hasMfa: true chỉ khi có factor TOTP đã xác minh; lỗi thì false', async () => {
  const mk = (r) => setup({ auth: { mfa: { listFactors: r } } }).rrtMfa.hasMfa();
  assert.equal(await mk(() => Promise.resolve({ data: { totp: [{ id: 1 }] } })), true);
  assert.equal(await mk(() => Promise.resolve({ data: { totp: [] } })), false);
  assert.equal(await mk(() => Promise.reject(new Error('x'))), false);
});

test('verifyPassword: dùng client TẠM không lưu phiên; thiếu cấu hình thì trả lỗi', async () => {
  let opts;
  const w = setup({});
  w.rrtShared.supabaseConfig = { url: 'https://x.supabase.co', key: 'k' };
  w.supabase = {
    createClient: (u, k, o) => ((opts = o), { auth: { signInWithPassword: async () => ({ error: null }) } }),
  };
  const r = await w.rrtMfa.verifyPassword('a@b.c', 'pw');
  assert.equal(r.error, null);
  assert.equal(opts.auth.persistSession, false);
  assert.equal(opts.auth.autoRefreshToken, false);

  w.rrtShared.supabaseConfig = undefined;
  assert.ok((await w.rrtMfa.verifyPassword('a@b.c', 'pw')).error);
});

test('bật MFA: gửi issuer "HCDC RRT" để ứng dụng Authenticator không hiện tên site của LIMS', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../js/app/mfa.js'), 'utf8');
  assert.match(src, /issuer: ISSUER,/);
  assert.equal(setup({}).rrtMfa.ISSUER, 'HCDC RRT');
});
