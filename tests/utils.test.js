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

test('QueryCache: TTL riêng cho từng key', async () => {
  const env = createBrowserEnv();
  env.load('utils/query-cache.js');
  const qc = env.window.QueryCache;
  let calls = 0;
  await qc.fetch('short', async () => ++calls, 1000);
  qc.cache.get('short').timestamp -= 1001;
  assert.equal(await qc.fetch('short', async () => ++calls, 1000), 2);
});

test('QueryCache.bindClient: ghi vào bảng đang cache thì tự xóa cache (trước và sau request)', async () => {
  const env = createBrowserEnv();
  env.load('utils/query-cache.js');
  const qc = env.window.QueryCache;
  // builder giả: lazy, chỉ có then(), các lệnh lọc trả về chính nó
  const client = {
    from(table) {
      const b = { table };
      for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq']) b[m] = () => b;
      b.then = (ok, err) => Promise.resolve({ data: [], error: null }).then(ok, err);
      return b;
    },
  };
  qc.bindClient(client);
  qc.bindClient(client); // gọi 2 lần không bọc chồng

  const seed = () => {
    qc.cache.set('incidents:active', { data: 1, timestamp: Date.now() });
    qc.cache.set('profiles:admin', { data: 1, timestamp: Date.now() });
  };
  seed();
  const pending = client.from('incidents').update({ status: 'closed' }).eq('id', 1);
  assert.equal(qc.cache.has('incidents:active'), false);
  assert.equal(qc.cache.has('profiles:admin'), true, 'bảng khác không bị ảnh hưởng');
  qc.cache.set('incidents:active', { data: 'stale', timestamp: Date.now() }); // đọc xen giữa
  await pending;
  assert.equal(qc.cache.has('incidents:active'), false, 'xóa lại sau khi request xong');

  seed();
  await client.from('incidents').select('*');
  assert.equal(qc.cache.has('incidents:active'), true, 'đọc dữ liệu không xóa cache');
  await client.from('notifications').update({ is_read: true });
  assert.equal(qc.cache.has('incidents:active'), true);
});

test('jsAttr / jsonAttr: an toàn trong onclick và trả lại đúng giá trị gốc', () => {
  const env = createBrowserEnv();
  env.load('utils/escape.js');
  const { jsAttr, jsonAttr } = env.window;
  const evil = [
    `x'); alert(1); ('`,
    `"><img src=x onerror=alert(1)>`,
    `&#39;);alert(1);//`,
    "a\\'b",
    'line\nbreak\u2028\u2029',
    'Khoa A & B <Cấp cứu> `tpl` ${x}',
    "Chợ Rẫy's",
    42,
  ];
  for (const v of evil) {
    const out = jsAttr(v);
    assert.doesNotMatch(out, /[&<>"'`\n\r\u2028\u2029]/, 'không còn ký tự đặc biệt HTML/JS');
    // Không có entity nào để trình duyệt giải mã → JS nhận nguyên văn out
    assert.equal(new Function(`return '${out}'`)(), String(v));

    const json = jsonAttr({ name: v, n: 1 });
    assert.doesNotMatch(json, /[&<>']/);
    assert.equal(JSON.stringify(new Function(`return (${json})`)()), JSON.stringify({ name: v, n: 1 }));
  }
});
