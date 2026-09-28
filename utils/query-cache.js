// utils/query-cache.js
const QueryCache = {
  cache: new Map(),
  ttl: 5 * 60 * 1000, // 5 phút
  
  async fetch(key, fetchFn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  },
  
  // Gọi khi cần force refresh (vd: sau khi thêm/sửa/xóa)
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
};

window.QueryCache = QueryCache;
