import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, draft } from './helpers.js';
import { ApiError } from '../lib/api.js';
import { makeController } from '../lib/controller.js';

test('credentials are saved before request and retained after reopening', async () => {
  const f = fixture(); const input = draft();
  f.api.create = async () => { const saved = f.local.read().vault.records[0]; assert.equal(saved.password, input.password); assert.equal(saved.status, 'pending'); };
  const created = await f.controller.dispatch({ type: 'create', draft: input }); assert.equal(created.status, 'created');
  const reopened = makeController({ storage: f.storage, api: f.api });
  const snapshot = await reopened.dispatch({ type: 'snapshot' });
  assert.equal(snapshot.records[0].email, 'test-mail-123456@sisyphusx.com'); assert.equal(snapshot.records[0].password, input.password);
  assert.equal(snapshot.draft.id, input.id); assert.equal(snapshot.config.token, undefined);
});
test('repeated successful request id does not create a second user', async () => {
  const f = fixture(); const message = { type: 'create', draft: draft() };
  await f.controller.dispatch(message); await f.controller.dispatch(message); assert.equal(f.calls.length, 1);
});
test('concurrent creation clicks cannot race', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ api: { create: () => gate } });
  const first = f.controller.dispatch({ type: 'create', draft: draft() });
  await assert.rejects(f.controller.dispatch({ type: 'create', draft: draft() }), /正在创建/);
  release(); await first;
});
test('no token or permission means no mailbox and no saved attempt', async () => {
  for (const overrides of [{ config: { token: '' } }, { hasPermission: async () => false }]) {
    const f = fixture(overrides); await assert.rejects(f.controller.dispatch({ type: 'create', draft: draft() }));
    assert.equal(f.calls.length, 0); assert.equal(f.local.read().vault.records.length, 0);
  }
});
test('storage failure prevents the remote mutation', async () => {
  const f = fixture(); f.local.fail = true;
  await assert.rejects(f.controller.dispatch({ type: 'create', draft: draft() }), /storage full/); assert.equal(f.calls.length, 0);
});
test('uncertain request preserves credentials and cannot be automatically replayed', async () => {
  let calls = 0;
  const f = fixture({ api: { create: async () => { calls++; throw new ApiError('timeout', 'uncertain'); } } });
  const input = draft();
  const result = await f.controller.dispatch({ type: 'create', draft: input }); assert.equal(result.status, 'uncertain');
  await assert.rejects(f.controller.dispatch({ type: 'create', draft: input }), /待核对/);
  assert.equal(calls, 1); assert.equal(f.local.read().vault.records[0].password, input.password);
});
test('interrupted pending records recover as uncertain without network use', async () => {
  const f = fixture({ records: [{ id: 'old', email: 'x@example.com', status: 'pending', password: 'saved' }] });
  const state = await f.controller.dispatch({ type: 'snapshot' }); assert.equal(state.records[0].status, 'uncertain'); assert.equal(f.calls.length, 0);
});
test('authentication failure creates a failed record and a manual retry can succeed', async () => {
  const f = fixture(); const input = draft();
  f.api.create = async () => { throw new ApiError('invalid token', 'auth'); };
  assert.equal((await f.controller.dispatch({ type: 'create', draft: input })).status, 'failed');
  f.api.create = async () => {};
  assert.equal((await f.controller.dispatch({ type: 'create', draft: input })).status, 'created');
  assert.equal(f.local.read().vault.records.length, 1);
});
test('disabled password retention writes no passwords to local storage, including old records', async () => {
  const f = fixture(); await f.controller.dispatch({ type: 'create', draft: draft() });
  const config = { ...f.local.read().vault.config, savePasswords: false };
  await f.controller.dispatch({ type: 'save-config', config });
  assert.equal(f.local.read().vault.records[0].password, null);
  const input = { ...draft(), prefix: 'another-address' };
  const result = await f.controller.dispatch({ type: 'create', draft: input });
  assert.equal(result.password, input.password); assert.equal(f.local.read().vault.records[0].password, null);
  assert.equal(f.session.read().draft.password, input.password);
});
test('unknown domain / SQL payload are rejected before mutation', async () => {
  const f = fixture();
  for (const value of [{ ...draft(), domain: 'foreign.example' }, { ...draft(), prefix: "x' OR 1=1" }]) await assert.rejects(f.controller.dispatch({ type: 'create', draft: value }));
  assert.equal(f.calls.length, 0);
});
test('token generation stores only token, not admin credentials', async () => {
  const f = fixture();
  const state = await f.controller.dispatch({ type: 'generate-token', credentials: { email: 'admin@example.com', password: 'admin-secret' } });
  assert.equal(state.hasToken, true); assert.equal(state.token, undefined);
  assert.equal(f.local.read().vault.config.token, 'new-token');
  assert.ok(!JSON.stringify(f.local.read()).includes('admin-secret'));
});
test('local delete does not call the server', async () => {
  const f = fixture(); const input = draft(); await f.controller.dispatch({ type: 'create', draft: input });
  await f.controller.dispatch({ type: 'delete-record', id: input.id }); assert.equal(f.calls.length, 1); assert.equal(f.local.read().vault.records.length, 0);
});
test('a final storage error retains the earlier recovery record', async () => {
  const f = fixture(); f.api.create = async () => { f.local.fail = true; };
  await assert.rejects(f.controller.dispatch({ type: 'create', draft: draft() }), /最终状态未能保存/);
  assert.equal(f.local.read().vault.records[0].status, 'pending'); assert.ok(f.local.read().vault.records[0].password);
});
test('dot-separated independent account goes to the API and records unchanged', async () => {
  const f = fixture(); const input = { ...draft(), prefix: 'milo.arden' };
  const result = await f.controller.dispatch({type:'create',draft:input});
  assert.equal(result.status,'created'); assert.equal(result.email,'milo.arden@sisyphusx.com');
  assert.equal(f.calls[0].email,'milo.arden@sisyphusx.com');
  assert.equal(f.local.read().vault.records[0].email,'milo.arden@sisyphusx.com');
  const reopened = makeController({storage:f.storage,api:f.api});
  assert.equal((await reopened.dispatch({type:'snapshot'})).draft.prefix,'milo.arden');
});
test('inbox lookup validates the address and returns sanitized summaries without persistence', async () => {
  let requested = null;
  const f = fixture({api:{inbox:async (config,email) => {
    requested=email;
    return [{emailId:3,sendEmail:'login@example.com',sendName:'Login',subject:'验证码 482913',
      toEmail:email,createTime:'2026-09-20 12:00:00',text:'您的验证码是 482913，请勿泄露。'}];
  }}});
  const before = JSON.stringify(f.local.read());
  const result = await f.controller.dispatch({type:'inbox',email:'Milo.Arden@SISYPHUSX.com'});
  assert.equal(requested,'milo.arden@sisyphusx.com'); assert.equal(result.mails[0].codes[0].value,'482913');
  assert.ok(!('text' in result.mails[0]) && !('content' in result.mails[0]));
  assert.equal(JSON.stringify(f.local.read()),before);
});
test('inbox lookup rejects other domains and malformed addresses before API access', async () => {
  let calls=0; const f=fixture({api:{inbox:async()=>{calls++;return[];}}});
  for(const email of ['x@foreign.example','bad','x\'@sisyphusx.com']) await assert.rejects(f.controller.dispatch({type:'inbox',email}));
  assert.equal(calls,0);
});

test('pinning an existing alias persists selection without creating a user or exposing the token', async () => {
  const f = fixture();
  const result = await f.controller.dispatch({type:'pin-inbox',email:'  Existing.Alias@SISYPHUSX.com '});
  assert.deepEqual(result.pinnedInboxes,['existing.alias@sisyphusx.com']);
  assert.equal(result.preferredInbox,'existing.alias@sisyphusx.com');
  assert.ok(!('token' in result));
  assert.equal(f.calls.length,0); assert.deepEqual(f.local.read().vault.records,[]);
  const reopened = makeController({storage:f.storage,api:f.api});
  assert.deepEqual((await reopened.dispatch({type:'snapshot'})).config.pinnedInboxes,result.pinnedInboxes);
  await reopened.dispatch({type:'pin-inbox',email:'existing.alias@sisyphusx.com'});
  assert.equal(f.local.read().vault.config.pinnedInboxes.length,1);
  await reopened.dispatch({type:'unpin-inbox',email:'existing.alias@sisyphusx.com'});
  assert.deepEqual(f.local.read().vault.config.pinnedInboxes,[]);
  assert.equal(f.local.read().vault.config.preferredInbox,'');
});

test('pinned inboxes survive settings updates but are cleared when changing servers', async () => {
  const f = fixture();
  await f.controller.dispatch({type:'pin-inbox',email:'existing.alias@sisyphusx.com'});
  await f.controller.dispatch({type:'save-config',config:{...f.local.read().vault.config,token:'',passwordLength:20}});
  assert.equal(f.local.read().vault.config.preferredInbox,'existing.alias@sisyphusx.com');
  assert.deepEqual(f.local.read().vault.config.pinnedInboxes,['existing.alias@sisyphusx.com']);
  await f.controller.dispatch({type:'save-config',config:{...f.local.read().vault.config,baseUrl:'https://other.example.com',token:''}});
  assert.deepEqual(f.local.read().vault.config.pinnedInboxes,[]);
  assert.equal(f.local.read().vault.config.preferredInbox,'');
});

test('removing a configured domain removes its pinned inboxes and preferred selection', async () => {
  const f = fixture();
  await f.controller.dispatch({type:'pin-inbox',email:'existing.alias@sisyphusx.com'});
  await f.controller.dispatch({type:'save-config',config:{...f.local.read().vault.config,domains:['athinker.net'],defaultDomain:'athinker.net'}});
  assert.deepEqual(f.local.read().vault.config.pinnedInboxes,[]);
  assert.equal(f.local.read().vault.config.preferredInbox,'');
});

test('invalid pinned addresses and storage failures never create remote mailboxes', async () => {
  const f = fixture(); const before = JSON.stringify(f.local.read());
  for (const email of ['other@foreign.example','bad',"x'@sisyphusx.com"]) {
    await assert.rejects(f.controller.dispatch({type:'pin-inbox',email}));
  }
  assert.equal(JSON.stringify(f.local.read()),before);
  f.local.fail = true;
  await assert.rejects(f.controller.dispatch({type:'pin-inbox',email:'existing@sisyphusx.com'}),/storage full/);
  assert.equal(JSON.stringify(f.local.read()),before); assert.equal(f.calls.length,0);
});

test('a mixed inbox response never displays a different recipients message', async () => {
  const target = 'existing.alias@sisyphusx.com';
  const f = fixture({api:{inbox:async()=>[
    {emailId:3,toEmail:'other@sisyphusx.com',subject:'验证码 123456'},
    {emailId:2,toEmail:target.toUpperCase(),subject:'验证码 482913'},
    {emailId:1,subject:'验证码 654321'},
  ]}});
  const result = await f.controller.dispatch({type:'inbox',email:target});
  assert.deepEqual(result.mails.map(mail=>mail.emailId),[2]);
  assert.equal(result.mails[0].codes[0].value,'482913');
});
