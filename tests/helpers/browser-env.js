// Tạo môi trường "trình duyệt" tối giản để nạp các classic script của app
// (window.*, document, localStorage) trong Node bằng module vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function createBrowserEnv(overrides = {}) {
  const listeners = {};
  const storage = new Map();
  const document = {
    addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { classList: { remove() {} }, style: {} },
  };
  const window = {
    document,
    console: overrides.console || { log() {}, warn() {}, error() {}, debug() {} },
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    location: { href: '', hostname: 'localhost' },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Map,
    ...overrides,
  };
  window.window = window;
  const context = vm.createContext(window);
  return {
    window,
    context,
    load(relPath) {
      const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      vm.runInContext(code, context, { filename: relPath });
    },
    dispatch(type) {
      for (const fn of listeners[type] || []) fn.call(document, { type });
    },
  };
}

module.exports = { createBrowserEnv, ROOT };
