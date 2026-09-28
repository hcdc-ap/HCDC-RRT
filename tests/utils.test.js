const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserEnv } = require('./helpers/browser-env');

test('batchFetch: truy vấn lỗi trả về null (không phải object {error}) và được gom vào .errors', async () => {
  const env = createBrowserEnv();
  env.load('utils/batch-fetch.js');
  const boom = new Error('RLS denied');
  const res = await env.window.batchFetch([
    async () => [1, 2],
    async () => {
      throw boom;
    },
    async () => [],
  ]);
  assert.deepEqual([...res], [[1, 2], null, []]);
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].index, 1);
  assert.equal(res.errors[0].error, boom);
  // Mẫu dùng ở core.js: `kết_quả || []` phải cho ra mảng khi truy vấn lỗi
  assert.ok(Array.isArray(res[1] || []));
});

test('batchFetch: chạy các truy vấn song song', async () => {
  const env = createBrowserEnv();
  env.load('utils/batch-fetch.js');
  const order = [];
  const delay = (ms, v) => new Promise((r) => setTimeout(() => (order.push(v), r(v)), ms));
  const res = await env.window.batchFetch([() => delay(30, 'a'), () => delay(5, 'b')]);
  assert.deepEqual([...res], ['a', 'b']);
  assert.deepEqual(order, ['b', 'a']);
});

test('QueryCache: cache trong TTL, invalidate theo pattern', async () => {
  const env = createBrowserEnv();
  env.load('utils/query-cache.js');
  const qc = env.window.QueryCache;
  let calls = 0;
  const fetcher = async () => ++calls;
  assert.equal(await qc.fetch('incidents:active', fetcher), 1);
  assert.equal(await qc.fetch('incidents:active', fetcher), 1);
  qc.invalidate('incidents');
  assert.equal(await qc.fetch('incidents:active', fetcher), 2);
  // Hết TTL → tải lại
  qc.cache.get('incidents:active').timestamp -= qc.ttl + 1;
  assert.equal(await qc.fetch('incidents:active', fetcher), 3);
});

test('QueryCache: lỗi khi tải không bị cache', async () => {
  const env = createBrowserEnv();
  env.load('utils/query-cache.js');
  const qc = env.window.QueryCache;
  await assert.rejects(qc.fetch('k', async () => Promise.reject(new Error('x'))));
  assert.equal(qc.cache.has('k'), false);
});

test('debounce: chỉ gọi 1 lần với tham số cuối', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = createBrowserEnv({ setTimeout, clearTimeout });
  env.load('utils/debounce.js');
  const seen = [];
  const f = env.window.debounce((v) => seen.push(v), 300);
  f(1);
  f(2);
  f(3);
  t.mock.timers.tick(299);
  assert.deepEqual(seen, []);
  t.mock.timers.tick(1);
  assert.deepEqual(seen, [3]);
});
