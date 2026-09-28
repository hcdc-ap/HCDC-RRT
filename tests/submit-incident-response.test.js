// submitIncidentResponse (js/app/incident-response.js) — thành viên xác nhận /
// từ chối tham gia sự kiện.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserEnv } = require('./helpers/browser-env');

// Giả lập supabase-js: query builder lazy, CHỈ có then() (giống bản thật)
function fakeSupabase(log, opts = {}) {
  const db = { incident: { members: 'b@x.vn', declined_members: 'a@x.vn' } };
  function builder(table) {
    const q = { table, ops: [] };
    const b = {};
    for (const m of ['select', 'update', 'insert', 'eq', 'in', 'single']) {
      b[m] = (...args) => (q.ops.push([m, ...args]), b);
    }
    b.then = (onOk, onErr) => {
      log.push(q);
      const op = (name) => q.ops.find((o) => o[0] === name);
      let result = { data: null, error: null };
      if (table === 'incidents' && op('update')) Object.assign(db.incident, op('update')[1]);
      else if (table === 'incidents') result.data = { id: 'inc-1', ...db.incident };
      if (table === 'deployment_history' && op('update')) result.data = opts.existingHistory ? [{ id: 1 }] : [];
      return Promise.resolve(result).then(onOk, onErr);
    };
    return b;
  }
  return {
    db,
    from: builder,
    rpc: async (name, params) => {
      log.push({ rpc: name, params: JSON.parse(JSON.stringify(params)) });
      if (opts.rpcMissing)
        return { error: { code: 'PGRST202', message: 'Could not find the function public.update_incident_membership' } };
      if (opts.rpcError) return { error: { code: '42501', message: 'permission denied' } };
      return { error: null };
    },
  };
}

function setup(opts) {
  const log = [];
  const toasts = [];
  const opened = [];
  const env = createBrowserEnv();
  env.load('auth-helpers.js');
  env.load('utils/query-cache.js');
  env.load('js/app/incident-response.js');
  const supa = fakeSupabase(log, opts);
  Object.assign(env.window, {
    supabaseClient: supa,
    showToast: (msg, type) => toasts.push(type + ':' + msg),
    showLoadingSpinner() {},
    hideLoadingSpinner() {},
    selectedIncidentId: 'inc-1',
    userSession: { id: 'user-1', email: 'A@X.vn ', role: 'user' },
    openDossierView: (s) => opened.push(JSON.parse(decodeURIComponent(s))),
    appState: { trackingIncidents: [{ id: 'inc-1' }] },
  });
  return { env, log, toasts, opened, supa };
}

const find = (log, table, op) => log.filter((q) => q.table === table && q.ops.some((o) => o[0] === op));

test('xác nhận: gọi RPC atomic, đánh dấu thông báo đã đọc, ghi lịch sử, mở lại dossier', async () => {
  const { env, log, toasts, opened } = setup();
  env.window.QueryCache.cache.set('incidents:active', { data: [], timestamp: Date.now() });
  await env.window.submitIncidentResponse('confirm');

  assert.deepEqual(log[0], {
    rpc: 'update_incident_membership',
    params: { p_incident_id: 'inc-1', p_email: 'a@x.vn', p_action: 'confirm' },
  });
  assert.equal(find(log, 'incidents', 'update').length, 0, 'không tự ghi incidents khi RPC chạy được');

  const noti = find(log, 'notifications', 'update')[0];
  assert.ok(noti, 'phải đánh dấu thông báo đã đọc');
  assert.equal(noti.ops.find((o) => o[0] === 'update')[1].is_read, true);

  const ins = find(log, 'deployment_history', 'insert')[0];
  assert.ok(ins, 'chưa có lịch sử → insert mới');
  assert.equal(ins.ops.find((o) => o[0] === 'insert')[1].action_type, 'deployed');

  assert.deepEqual(toasts, ['success:Đã xác nhận tham gia!']);
  assert.equal(opened.length, 1);
  assert.equal(env.window.QueryCache.cache.has('incidents:active'), false, 'cache sự kiện phải bị xóa');
});

test('từ chối khi đã có lịch sử: chỉ update, action_type = declined', async () => {
  const { env, log } = setup({ existingHistory: true });
  await env.window.submitIncidentResponse('decline');
  const upd = find(log, 'deployment_history', 'update')[0];
  assert.equal(upd.ops.find((o) => o[0] === 'update')[1].action_type, 'declined');
  assert.equal(find(log, 'deployment_history', 'insert').length, 0);
});

test('database chưa có RPC: tự quay về đọc → sửa → ghi', async () => {
  const { env, supa, toasts } = setup({ rpcMissing: true });
  await env.window.submitIncidentResponse('confirm');
  assert.equal(supa.db.incident.members, 'b@x.vn;a@x.vn');
  assert.equal(supa.db.incident.declined_members, '');
  assert.equal(supa.db.incident.confirmations, 2);
  assert.deepEqual(toasts, ['success:Đã xác nhận tham gia!']);
});

test('RPC lỗi quyền: báo lỗi, không ghi gì thêm', async () => {
  const { env, log, toasts } = setup({ rpcError: true });
  await env.window.submitIncidentResponse('confirm');
  assert.equal(log.length, 1);
  assert.match(toasts[0], /^error:Lỗi hệ thống: permission denied/);
});
