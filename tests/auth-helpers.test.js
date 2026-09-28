const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserEnv } = require('./helpers/browser-env');

function envWithRole(role) {
  const env = createBrowserEnv();
  env.load('auth-helpers.js');
  env.window.userSession = role === undefined ? null : { id: 'u1', role };
  return env.window;
}

test('isUserAdmin / isUserManager / hasRole không phân biệt hoa thường, khoảng trắng', () => {
  const w = envWithRole(' Admin ');
  assert.equal(w.isUserAdmin(), true);
  assert.equal(w.isUserManager(), true);
  assert.equal(w.hasRole('ADMIN'), true);
  assert.equal(w.hasRole(''), false);

  const u = envWithRole('user');
  assert.equal(u.isUserAdmin(), false);
  assert.equal(u.isUserManager(), false);

  const none = envWithRole(undefined);
  assert.equal(none.isUserAdmin(), false);
});

test('getCurrentUserId: ưu tiên session, fallback token Supabase trong localStorage', () => {
  const w = envWithRole('user');
  assert.equal(w.getCurrentUserId(), 'u1');

  w.userSession = null;
  w.supabaseClient = { projectRef: 'abc' };
  assert.equal(w.getCurrentUserId(), null);
  w.localStorage.setItem('sb-abc-auth-token', JSON.stringify({ user: { id: 'from-storage' } }));
  assert.equal(w.getCurrentUserId(), 'from-storage');
  w.localStorage.setItem('sb-abc-auth-token', '{not json');
  assert.equal(w.getCurrentUserId(), null);
});
