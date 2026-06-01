// utils/batch-fetch.js
window.batchFetch = async function (queries) {
  console.log(`📦 Batch fetching ${queries.length} queries...`);
  const results = await Promise.allSettled(
    queries.map(q => q().catch(err => ({ error: err })))
  );
  
  return results.map(r => r.status === 'fulfilled' ? r.value : null);
};
