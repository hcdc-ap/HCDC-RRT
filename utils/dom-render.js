// utils/dom-render.js
window.renderBatch = function (containerId, items, renderItem) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const fragment = document.createDocumentFragment();
  
  items.forEach((item, index) => {
    const el = renderItem(item, index);
    if (el) fragment.appendChild(el);
  });
  
  // Chỉ 1 lần reflow duy nhất thay vì N lần
  container.innerHTML = '';
  container.appendChild(fragment);
  console.log(`✅ Rendered ${items.length} items to #${containerId}`);
};
