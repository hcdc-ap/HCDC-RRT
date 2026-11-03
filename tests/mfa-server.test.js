// Test phần thuần của supabase/functions/_shared/mfa.ts (Node đọc TypeScript trực tiếp).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let m;
test.before(async () => {
  m = await import(pathToFileURL(path.join(__dirname, '../supabase/functions/_shared/mfa.ts')).href);
});

test('sinh 10 mã khác nhau, đúng định dạng XXXX-XXXX và đúng bảng chữ', () => {
  const codes = m.generateBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
});
test('normalizeBackupCode khớp bản ở trình duyệt', () => {
  const h = require('../mfa-helpers.js');
  for (const s of ['abcd-efgh', 'ABCDEFGH', ' ab cd-ef gh', 'ABC0-EFGH', '', 'ABCD-EFGHJ', null])
    assert.equal(m.normalizeBackupCode(s), h.normalizeBackupCode(s));
});
test('hashCode: SHA-256 hex ổn định, mã khác thì băm khác', async () => {
  const a = await m.hashCode('ABCD-EFGH');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await m.hashCode('ABCD-EFGH'));
  assert.notEqual(a, await m.hashCode('ABCD-EFGJ'));
  assert.equal(a, require('crypto').createHash('sha256').update('ABCD-EFGH').digest('hex'));
});
test('aalFromJwt: đọc aal từ header Authorization; hỏng thì rỗng', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(m.aalFromJwt('Bearer ' + enc({}) + '.' + enc({ aal: 'aal2' }) + '.s'), 'aal2');
  assert.equal(m.aalFromJwt('Bearer xxx'), '');
  assert.equal(m.aalFromJwt(''), '');
});
