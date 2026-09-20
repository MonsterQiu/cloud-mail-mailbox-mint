import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeBaseUrl, normalizeConfig, normalizeDomains, validatePrefix, publicConfig, validateToken, validateMailboxAddress } from '../lib/validation.js';

test('site normalization rejects unsafe origins and accidental API paths', () => {
  assert.equal(normalizeBaseUrl(' https://WEBMAIL.sisyphusx.com/ '), DEFAULT_CONFIG.baseUrl);
  for (const url of ['http://example.com', 'https://example.com/api', 'https://user:secret@example.com', 'https://example.com?q=x', 'javascript:alert(1)', 'https://example.com:444', 'https://example.com/#x']) assert.throws(() => normalizeBaseUrl(url));
});
test('domain list normalization and prefix validation reject SQL/HTML/control input', () => {
  assert.deepEqual(normalizeDomains('@SISYPHUSX.com, athinker.net\nsisyphusx.com'), ['sisyphusx.com', 'athinker.net']);
  for (const domain of ['https://abc.com', '-bad.com', 'a..com', 'abc.com\n<script>']) assert.throws(() => normalizeDomains(domain));
  for (const name of ["a'b", 'a@x.com', '-test', 'test-', '<script>', 'a'.repeat(31)]) assert.throws(() => validatePrefix(name));
  assert.equal(validatePrefix(' HELLO-123 '), 'hello-123');
});
test('dot-separated names preserve the dot and reject invalid dot placements', () => {
  assert.equal(validatePrefix(' Milo.Arden '), 'milo.arden');
  assert.equal(validatePrefix('nora.vale'), 'nora.vale');
  for (const name of ['.milo', 'milo.', 'milo..arden', '.', '..']) assert.throws(() => validatePrefix(name));
  assert.equal(validatePrefix('crisp-orbit-765715'), 'crisp-orbit-765715');
});
test('mailbox lookup requires an exact address on a configured domain', () => {
  assert.equal(validateMailboxAddress(' Milo.Arden@SISYPHUSX.com ', DEFAULT_CONFIG.domains), 'milo.arden@sisyphusx.com');
  for (const email of ['milo', 'milo@@sisyphusx.com', 'milo@foreign.example', "x'@sisyphusx.com", 'milo..arden@sisyphusx.com']) {
    assert.throws(() => validateMailboxAddress(email, DEFAULT_CONFIG.domains));
  }
});
test('changing servers clears the old token and verification', () => {
  const previous = { ...DEFAULT_CONFIG, token: 'old-secret', testedAt: 'today' };
  assert.equal(normalizeConfig({ ...DEFAULT_CONFIG, token: '' }, previous).token, 'old-secret');
  const changed = normalizeConfig({ ...DEFAULT_CONFIG, baseUrl: 'https://other.example.com', token: '' }, previous);
  assert.equal(changed.token, ''); assert.equal(changed.testedAt, null);
  assert.equal(normalizeConfig({ ...DEFAULT_CONFIG, clearToken: true }, previous).token, '');
});
test('public config never contains the token', () => {
  const safe = publicConfig({ ...DEFAULT_CONFIG, token: 'secret' });
  assert.equal(safe.hasToken, true); assert.ok(!('token' in safe));
  assert.throws(() => validateToken('Bearer secret')); assert.throws(() => validateToken('a\nb'));
});
