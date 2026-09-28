// utils/batch-fetch.js
// Chạy song song nhiều truy vấn. Truy vấn nào lỗi sẽ trả về null (KHÔNG trả về
// object {error}) để code gọi có thể dùng `kết_quả || []` an toàn; lỗi được
// log ra console và gom vào thuộc tính `errors` của mảng kết quả.
window.batchFetch = async function (queries) {
  const results = await Promise.allSettled(queries.map((q) => q()));
  const errors = [];
  const values = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    errors.push({ index: i, error: r.reason });
    console.error(`❌ batchFetch: truy vấn #${i} lỗi:`, r.reason);
    return null;
  });
  values.errors = errors;
  return values;
};
