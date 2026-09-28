// utils/query-cache.js
// Cache kết quả truy vấn trong bộ nhớ (theo key), có TTL riêng cho từng key.
// Tự làm mới:
//   - bindClient(supabaseClient): mọi insert/update/upsert/delete trên các bảng
//     trong TABLE_PREFIX sẽ xóa cache tương ứng (trước và sau khi request xong).
//   - RealtimeManager (js/app/core.js) gọi invalidate() khi DB báo thay đổi.
const QueryCache = {
  cache: new Map(),
  ttl: 5 * 60 * 1000, // mặc định 5 phút

  // Bảng Supabase → tiền tố key cache bị ảnh hưởng khi bảng đó thay đổi
  TABLE_PREFIX: {
    profiles: 'profiles',
    incidents: 'incidents',
    training_courses: 'training',
    deployment_history: 'deployments',
  },

  async fetch(key, fetchFn, ttl = this.ttl) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < (cached.ttl ?? ttl)) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
    return data;
  },

  // Xóa mọi key chứa pattern (vd: invalidate('incidents'))
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  },

  bindClient(client) {
    if (!client || client.__queryCacheBound) return client;
    const self = this;
    const origFrom = client.from.bind(client);
    client.from = function (table) {
      const qb = origFrom(table);
      const prefix = self.TABLE_PREFIX[table];
      if (!prefix) return qb;
      for (const method of ['insert', 'update', 'upsert', 'delete']) {
        const orig = qb[method];
        if (typeof orig !== 'function') continue;
        qb[method] = function (...args) {
          const fb = orig.apply(qb, args);
          self.invalidate(prefix);
          // Builder của supabase-js trả về chính nó qua các lệnh .eq/.select…
          // nên bọc then() một lần là đủ để xóa cache khi request hoàn tất.
          const then = fb.then.bind(fb);
          fb.then = (onOk, onErr) =>
            then((res) => {
              self.invalidate(prefix);
              return res;
            }).then(onOk, onErr);
          return fb;
        };
      }
      return qb;
    };
    client.__queryCacheBound = true;
    return client;
  },
};

window.QueryCache = QueryCache;
