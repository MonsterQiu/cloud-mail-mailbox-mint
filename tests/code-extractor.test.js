import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCodeCandidates, plainText, summarizeMail } from '../lib/code-extractor.js';

test('extracts Chinese and English numeric verification codes with high confidence', () => {
  for (const mail of [
    { subject: '登录验证码 482913', text: '此验证码 10 分钟内有效。' },
    { subject: 'Your verification code', text: 'Use 8253 to continue.' },
    { subject: 'One-time password', text: 'Your OTP is 123 456.' },
  ]) {
    const candidate = extractCodeCandidates(mail)[0];
    assert.ok(candidate); assert.equal(candidate.confidence, 'high');
  }
  assert.equal(extractCodeCandidates({subject:'登录验证码',text:'您的验证码是 123 456'})[0].value, '123456');
});

test('extracts short mixed letter-number codes and removes display hyphens', () => {
  assert.equal(extractCodeCandidates({ subject: 'Security code: AB12-CD34' })[0].value, 'AB12CD34');
  assert.equal(extractCodeCandidates({ text: 'Your login code is G7K9P2.' })[0].value, 'G7K9P2');
});

test('does not promote years, long phone numbers, prices or order numbers', () => {
  const candidates = extractCodeCandidates({
    subject: 'Your 2026 order update',
    text: '订单号 123456，客服电话 13800138000，价格 CNY 8253。',
  });
  assert.deepEqual(candidates, []);
});

test('HTML fallback strips scripts, tags and entities without executing content', () => {
  const html = '<style>.x{}</style><script>steal(123456)</script><p>Verification&nbsp;code: <b>604219</b></p>';
  assert.equal(plainText(html), 'Verification code: 604219');
  const summary = summarizeMail({ emailId: '9', subject: '<b>Login</b>', content: html,
    sendEmail: 'sender@example.com', sendName: 'Example', toEmail: 'milo728@example.test', createTime: '2026-09-20 12:00:00' });
  assert.equal(summary.emailId, 9); assert.equal(summary.codes[0].value, '604219');
  assert.ok(!summary.snippet.includes('steal'));
});

test('summary bounds untrusted server fields and code candidates', () => {
  const summary = summarizeMail({ subject:'验证码 482913' + 'x'.repeat(500), text:'body '.repeat(500),
    sendEmail:'a'.repeat(500), sendName:'b'.repeat(500), toEmail:'c'.repeat(500), createTime:'d'.repeat(100) });
  assert.ok(summary.subject.length <= 160); assert.ok(summary.snippet.length <= 220);
  assert.ok(summary.fromEmail.length <= 254); assert.ok(summary.fromName.length <= 100);
  assert.ok(summary.createTime.length <= 40); assert.ok(summary.codes.length <= 4);
});

test('very large bodies are bounded before HTML and candidate processing', () => {
  const huge = '<p>验证码 482913</p>' + 'x'.repeat(300000);
  const text = plainText(huge);
  assert.ok(text.length <= 200000);
  assert.equal(extractCodeCandidates({content:huge})[0].value, '482913');
});
