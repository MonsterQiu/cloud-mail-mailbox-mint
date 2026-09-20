import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApi } from '../lib/api.js';
const config = { baseUrl: 'https://mail.example.com', token: 'private-token', roleName: '普通用户' };
const reply = (json, status = 200) => new Response(JSON.stringify(json), { status });

test('creation uses one-element list and raw Authorization; redirects and cookies blocked', async () => {
  let request;
  const api = makeApi(async (url, init) => { request = { url, ...init }; return reply({ code: 200, data: null }); });
  await api.create(config, { email: 'alice@example.com', password: 'my-password' });
  assert.equal(request.url, 'https://mail.example.com/api/public/addUser');
  assert.equal(request.headers.Authorization, 'private-token'); assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'omit');
  assert.deepEqual(JSON.parse(request.body), { list: [{ email: 'alice@example.com', password: 'my-password', roleName: '普通用户' }] });
});
test('HTTP 200 with code 401 is a failed request', async () => {
  const api = makeApi(async () => reply({ code: 401, message: 'token验证失败' }));
  await assert.rejects(api.create(config, { email: 'x@example.com', password: 'foo' }), e => e.kind === 'auth');
});
test('connection test has no users and token generation carries no old token', async () => {
  const calls = [];
  const api = makeApi(async (url, init) => { calls.push(init); return reply({ code: 200, data: { token: 'new' } }); });
  await api.test(config); await api.token(config, { email: 'admin@example.com', password: 'foo' });
  assert.deepEqual(JSON.parse(calls[0].body), { list: [] }); assert.ok(!('Authorization' in calls[1].headers));
});
test('inbox query is exact, bounded and only requests received non-deleted mail', async () => {
  let request;
  const api = makeApi(async (url, init) => { request = {url, ...init}; return reply({code:200,data:[]}); });
  await api.inbox(config, 'milo.arden@example.com');
  assert.equal(request.url, 'https://mail.example.com/api/public/emailList');
  assert.equal(request.headers.Authorization, 'private-token');
  assert.deepEqual(JSON.parse(request.body), {toEmail:'milo.arden@example.com',timeSort:'desc',num:1,size:5,type:0,isDel:0});
});
test('network failures and invalid success envelopes are uncertain for creation', async () => {
  for (const fetcher of [async () => { throw new TypeError('offline'); }, async () => new Response('<html>bad gateway</html>'), async () => reply({ code: 502 })]) {
    await assert.rejects(makeApi(fetcher).create(config, { email: 'x@example.com', password: 'foo' }), e => e.kind === 'uncertain');
  }
});
test('duplicate address is not success; secrets in server messages are redacted', async () => {
  await assert.rejects(makeApi(async () => reply({ code: 500, message: 'email already exists' })).create(config, {}), e => e.kind === 'duplicate');
  await assert.rejects(makeApi(async () => reply({ code: 400, message: 'error private-token my-password' })).create(config, { password: 'my-password' }), e => !e.message.includes('private-token') && !e.message.includes('my-password'));
});
test('timeout aborts request without retrying', async () => {
  let calls = 0;
  const api = makeApi((url, { signal }) => new Promise((resolve, reject) => {
    calls++; signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), 5);
  await assert.rejects(api.create(config, {}), e => e.kind === 'uncertain'); assert.equal(calls, 1);
});
