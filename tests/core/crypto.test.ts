import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decrypt, encrypt, hashPassword, parseMasterKey, safeEqual, verifyPassword } from '../../lib/core/crypto.ts';
import { classifyFetchError } from '../../lib/core/errors.ts';
import { generatePassword } from '../../lib/core/password.ts';
import { checkLoginAllowed, recordLoginFailure, recordLoginSuccess, resetLimiter } from '../../lib/server/loginLimiter.ts';
import { normalizeBaseUrl, normalizeTags } from '../../lib/core/validate.ts';
import { randomBytes } from 'node:crypto';

describe('crypto', () => {
  it('round-trips and binds to aad', () => {
    const key = randomBytes(32);
    const ct = encrypt('secret', key, 'a');
    assert.equal(decrypt(ct, key, 'a'), 'secret');
    assert.throws(() => decrypt(ct, key, 'b'));
    assert.throws(() => decrypt(ct, randomBytes(32), 'a'));
  });
  it('validates the master key', () => {
    assert.throws(() => parseMasterKey(undefined));
    assert.throws(() => parseMasterKey('short'));
    assert.equal(parseMasterKey(randomBytes(32).toString('base64')).length, 32);
  });
  it('hashes and verifies passwords', () => {
    const h = hashPassword('correct horse battery');
    assert.ok(verifyPassword('correct horse battery', h));
    assert.ok(!verifyPassword('wrong', h));
    assert.ok(!verifyPassword('x', undefined));
    assert.ok(!verifyPassword('x', 'garbage'));
  });
  it('safeEqual handles empty and unequal', () => {
    assert.ok(safeEqual('abc', 'abc'));
    assert.ok(!safeEqual('abc', 'abd'));
    assert.ok(!safeEqual('', ''));
    assert.ok(!safeEqual(null, 'a'));
  });
});

describe('misc', () => {
  it('generates strong passwords', () => {
    const p = generatePassword();
    assert.equal(p.length, 20);
    assert.match(p, /[a-z]/); assert.match(p, /[A-Z]/); assert.match(p, /[0-9]/); assert.match(p, /[^A-Za-z0-9]/);
  });
  it('normalizes urls', () => {
    assert.equal(normalizeBaseUrl('https://a.example/jf/'), 'https://a.example/jf');
    assert.throws(() => normalizeBaseUrl('http://a.example'), /https/);
    assert.equal(normalizeBaseUrl('http://a.example', { allowHttp: true }), 'http://a.example');
    assert.throws(() => normalizeBaseUrl('https://u:p@a.example'), /credentials/);
    assert.throws(() => normalizeBaseUrl('https://a.example?x=1'), /query/);
    assert.throws(() => normalizeBaseUrl('ftp://a.example'), /https/);
  });
  it('normalizes tags', () => {
    assert.deepEqual(normalizeTags([' Mature ', 'mature', '', 'X']), ['mature', 'x']);
    assert.throws(() => normalizeTags('x'));
  });
  it('classifies fetch errors', () => {
    assert.equal(classifyFetchError({ cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }).kind, 'tls');
    assert.equal(classifyFetchError({ cause: { code: 'ECONNREFUSED' } }).kind, 'unreachable');
    assert.equal(classifyFetchError({ name: 'TimeoutError' }).kind, 'timeout');
  });
  it('locks out after repeated failures and clears on success', () => {
    resetLimiter();
    for (let i = 0; i < 5; i++) recordLoginFailure('Admin');
    assert.ok(!checkLoginAllowed('admin'));
    assert.ok(checkLoginAllowed('other'));
    assert.ok(checkLoginAllowed('admin', Date.now() + 16 * 60 * 1000));
    resetLimiter();
    recordLoginFailure('a'); recordLoginSuccess('a');
    assert.ok(checkLoginAllowed('a'));
  });
});
