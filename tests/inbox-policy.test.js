import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WATCH_DURATION_MS, nextPollDelay, latestEmailId, mailsAfter, mailTimestamp, recentMails, mailFreshness, formatBeijingMailDate } from '../lib/inbox-policy.js';

test('polling backs off from five to ten to fifteen seconds', () => {
  assert.equal(WATCH_DURATION_MS, 120000);
  assert.equal(nextPollDelay(0), 5000); assert.equal(nextPollDelay(29999), 5000);
  assert.equal(nextPollDelay(30000), 10000); assert.equal(nextPollDelay(59999), 10000);
  assert.equal(nextPollDelay(60000), 15000); assert.equal(nextPollDelay(119999), 15000);
});

test('new-mail policy compares monotonic ids and never reprocesses baseline mail', () => {
  const mails = [{emailId:13},{emailId:12},{emailId:0},{emailId:'bad'}];
  assert.equal(latestEmailId(mails), 13);
  assert.deepEqual(mailsAfter(mails, 12).map(x=>x.emailId), [13]);
  assert.deepEqual(mailsAfter(mails, 13), []);
});

test('D1 timestamps are parsed as UTC and start-race tolerance is bounded', () => {
  const started = Date.parse('2026-09-20T12:00:00Z');
  assert.equal(mailTimestamp('2026-09-20 12:00:00'), started);
  const mails = [
    {emailId:1,createTime:'2026-09-20 11:59:31'},
    {emailId:2,createTime:'2026-09-20 11:59:29'},
    {emailId:3,createTime:'invalid'},
  ];
  assert.deepEqual(recentMails(mails, started).map(x=>x.emailId), [1]);
});

test('mail timestamps are displayed explicitly in Beijing time', () => {
  assert.equal(formatBeijingMailDate('2026-09-20 12:00:00'), '09/20 20:00 北京时间');
  assert.equal(formatBeijingMailDate('2026-09-20T20:00:00+08:00'), '09/20 20:00 北京时间');
  assert.equal(formatBeijingMailDate('2026-09-20T12:00:00Z'), '09/20 20:00 北京时间');
  assert.equal(formatBeijingMailDate('invalid'), '时间未知');
});

test('freshness labels recent, aging and stale mail', () => {
  const now = Date.parse('2026-09-20T12:10:00Z');
  assert.deepEqual(mailFreshness('2026-09-20 12:09:30', now), {label:'刚刚收到',level:'fresh'});
  assert.equal(mailFreshness('2026-09-20 12:04:30', now).level, 'aging');
  assert.equal(mailFreshness('2026-09-20 11:59:59', now).level, 'stale');
  assert.equal(mailFreshness('', now).level, 'unknown');
});
