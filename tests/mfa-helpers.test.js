const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../mfa-helpers.js');

function jwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return enc({ alg: 'HS256' }) + '.' + enc(payload) + '.sig';
}

test('normalizeBackupCode: nhận chữ thường, thiếu gạch, có khoảng trắng', () => {
  assert.equal(h.normalizeBackupCode('abcd-efgh'), 'ABCD-EFGH');
  assert.equal(h.normalizeBackupCode('abcdefgh'), 'ABCD-EFGH');
  assert.equal(h.normalizeBackupCode('  abcd efgh '), 'ABCD-EFGH');
});
test('normalizeBackupCode: từ chối sai độ dài, ký tự dễ nhầm (0,O,1,I,L), rỗng, null', () => {
  for (const bad of ['', null, undefined, 'ABCD', 'ABCD-EFGHJ', 'ABC0-EFGH', 'ABCI-EFGH', 'ABCL-EFGH', 'ABCO-EFGH', 'ABC1-EFGH'])
    assert.equal(h.normalizeBackupCode(bad), '');
});
test('normalizeTotp: chỉ nhận đúng 6 chữ số', () => {
  assert.equal(h.normalizeTotp('123 456'), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', '', null]) assert.equal(h.normalizeTotp(bad), '');
});
test('aalFromJwt: đọc aal; token hỏng thì trả rỗng, không ném lỗi', () => {
  assert.equal(h.aalFromJwt(jwt({ aal: 'aal2' })), 'aal2');
  assert.equal(h.aalFromJwt(jwt({ aal: 'aal1' })), 'aal1');
  for (const bad of ['', 'abc', 'a.b.c', null, undefined]) assert.equal(h.aalFromJwt(bad), '');
});
test('needsSecondStep: chỉ true khi có factor verified và phiên chưa aal2', () => {
  const v = [{ status: 'verified' }];
  assert.equal(h.needsSecondStep({ user: { factors: v }, access_token: jwt({ aal: 'aal1' }) }), true);
  assert.equal(h.needsSecondStep({ user: { factors: v }, access_token: jwt({ aal: 'aal2' }) }), false);
  assert.equal(h.needsSecondStep({ user: { factors: [{ status: 'unverified' }] }, access_token: jwt({ aal: 'aal1' }) }), false);
  assert.equal(h.needsSecondStep({ user: {}, access_token: jwt({ aal: 'aal1' }) }), false);
  assert.equal(h.needsSecondStep(null), false);
});
test('ALPHABET khớp edge function _shared/mfa.ts', () => {
  const ts = require('fs').readFileSync(require('path').join(__dirname, '../supabase/functions/_shared/mfa.ts'), 'utf8');
  assert.ok(ts.includes(`"${h.ALPHABET}"`));
});
