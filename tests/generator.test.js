import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword, generatePrefix, generateDraft, randomInt } from '../lib/generator.js';
import { DEFAULT_CONFIG } from '../lib/validation.js';
import { validatePassword, validatePrefix } from '../lib/validation.js';

test('all generated credentials meet backend-compatible character and length constraints', () => {
  for (const length of [12, 18, 30]) for (let i = 0; i < 200; i++) {
    const password = generatePassword(length);
    assert.equal(password.length, length); assert.equal(validatePassword(password), password);
    const prefix = generatePrefix(); assert.equal(validatePrefix(prefix), prefix); assert.ok(!prefix.includes('-'));
  }
});
test('all four selected templates are reachable with predictable examples', () => {
  const expected = ['milo10', 'miloa10', 'velorin', 'milo.arden'];
  for (let style = 0; style < 4; style++) {
    let first = true;
    const random = { getRandomValues(values) { values[0] = first ? style : 0; first = false; } };
    assert.equal(generatePrefix(random), expected[style]);
  }
});
test('each template produces accepted names and the agreed character structure', () => {
  const patterns = [/^[a-z]+[1-9]\d{1,3}$/, /^[a-z]{3,}[1-9]\d{1,3}$/, /^[a-z]{6,10}$/, /^[a-z]+\.[a-z]+$/];
  for (let style = 0; style < 4; style++) for (let sample = 0; sample < 150; sample++) {
    let first = true;
    const random = { getRandomValues(values) {
      if (first) { values[0] = style; first = false; } else crypto.getRandomValues(values);
    } };
    const prefix = generatePrefix(random);
    assert.match(prefix, patterns[style]); assert.equal(validatePrefix(prefix), prefix);
  }
});
test('fresh drafts use the new generator without modifying existing drafts', () => {
  const value = generateDraft(DEFAULT_CONFIG);
  assert.ok(!value.prefix.includes('-')); assert.equal(validatePrefix(value.prefix), value.prefix);
  assert.equal(value.domain, DEFAULT_CONFIG.defaultDomain); assert.equal(validatePassword(value.password), value.password);
});
test('invalid lengths cannot silently weaken passwords', () => {
  for (const length of [0, 6, 11, 31, 18.5, NaN]) assert.throws(() => generatePassword(length));
});
test('rejection sampling discards biased remainder', () => {
  let calls = 0;
  const source = { getRandomValues: arr => { arr[0] = calls++ ? 7 : 0xffffffff; } };
  assert.equal(randomInt(10, source), 7); assert.equal(calls, 2);
});
