// Hồi quy: submitIncidentResponse (fix-patches.js) từng gọi .catch() trên query
// builder của supabase-js — builder chỉ có .then() nên ném TypeError, lịch sử
// điều động không được ghi và người dùng thấy toast lỗi dù đã xác nhận xong.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserEnv } = require('./helpers/browser-env');

// Giả lập PostgrestBuilder: lazy + CHỈ có then() (giống supabase-js thật)
function fakeSupabase(log, { historyError = null } = {}) {
  function builder(table) {
    const q = { table, ops: [] };
    const b = {};
    for (const m of ['select', 'update', 'upsert', 'insert', 'delete', 'eq', 'single']) {
      b[m] = (...args) => (q.ops.push([m, ...args]), b);
    }
    b.then = (onOk, onErr) => {
      log.push(q);
      let result = { data: null, error: null };
      if (table === 'deployment_history') result.error = historyError;
      if (table === 'incidents') result.data = { id: 'inc-1', members: 'a@x.vn' };
      return Promise.resolve(result).then(onOk, onErr);
    };
    return b;
  }
  return {
    from: builder,
    rpc: async (name, params) => (log.push({ rpc: name, params }), { error: null }),
  };
}

function setup(opts) {
  const log = [];
  const toasts = [];
  const opened = [];
  const env = createBrowserEnv();
  env.load('auth-helpers.js');
  env.window.showToast = (msg, type) => toasts.push([type, msg]);
  env.load('fix-patches.js');
  Object.assign(env.window, {
    supabaseClient: fakeSupabase(log, opts),
    selectedIncidentId: 'inc-1',
    userSession: { id: 'user-1', email: 'A@X.vn ', role: 'user' },
    openDossierView: (s) => opened.push(JSON.parse(decodeURIComponent(s))),
    appState: { trackingIncidents: [] },
  });
  return { env, log, toasts, opened };
}

test('xác nhận tham gia: ghi deployment_history, không báo lỗi, mở lại dossier', async () => {
  const { env, log, toasts, opened } = setup();
  await env.window.submitIncidentResponse('confirm');

  // (đối tượng tạo trong vm context khác realm → so sánh qua JSON)
  assert.deepEqual(JSON.parse(JSON.stringify(log[0])), {
    rpc: 'update_incident_membership',
    params: { p_incident_id: 'inc-1', p_email: 'a@x.vn', p_action: 'confirm' },
  });
  const history = log.find((q) => q.table === 'deployment_history');
  assert.ok(history, 'upsert deployment_history phải thực sự được gửi đi');
  const [, row, conflict] = history.ops.find((o) => o[0] === 'upsert');
  assert.equal(row.action_type, 'deployed');
  assert.equal(row.user_id, 'user-1');
  assert.equal(conflict.onConflict, 'incident_id,user_id');

  assert.equal(JSON.stringify(toasts), JSON.stringify([['success', '✅ Đã xác nhận tham gia!']]));
  assert.equal(opened.length, 1);
  assert.equal(env.window.appState.trackingIncidents.length, 1);
});

test('từ chối: action_type = declined', async () => {
  const { env, log } = setup();
  await env.window.submitIncidentResponse('decline');
  const history = log.find((q) => q.table === 'deployment_history');
  assert.equal(history.ops.find((o) => o[0] === 'upsert')[1].action_type, 'declined');
});

test('lỗi ghi lịch sử không chặn luồng chính', async () => {
  const { env, toasts, opened } = setup({ historyError: { message: 'check constraint' } });
  await env.window.submitIncidentResponse('confirm');
  assert.equal(toasts[0][0], 'success');
  assert.equal(opened.length, 1);
});
