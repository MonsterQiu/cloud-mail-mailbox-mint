import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryArea } from './helpers.js';

test('real service worker accepts own UI messages only and restricts storage access', async () => {
  let listener;
  const levels = [];
  const local = memoryArea(); const session = memoryArea();
  local.setAccessLevel = session.setAccessLevel = async value => { levels.push(value); };
  globalThis.chrome = {
    runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`,
      onMessage: { addListener: callback => { listener = callback; } } },
    storage: { local, session }, permissions: { contains: async () => true },
  };
  try {
    await import('../background/service-worker.js');
    assert.deepEqual(levels, [{ accessLevel: 'TRUSTED_CONTEXTS' }, { accessLevel: 'TRUSTED_CONTEXTS' }]);
    let replied = false;
    for (const sender of [
      { id: 'foreign', url: 'https://attacker.example' },
      { id: 'test-extension', url: 'https://webmail.sisyphusx.com/' },
      { id: 'test-extension', url: 'chrome-extension://test-extension/other.html' },
    ]) assert.equal(listener({ type: 'snapshot' }, sender, () => { replied = true; }), false);
    assert.equal(replied, false);
    const response = await new Promise(resolve => {
      assert.equal(listener({ type: 'snapshot' }, { id: 'test-extension', url: 'chrome-extension://test-extension/popup/popup.html' }, resolve), true);
    });
    assert.equal(response.ok, true); assert.equal(response.value.config.hasToken, false);
    assert.ok(response.value.draft.password); assert.ok(!('token' in response.value.config));
  } finally { delete globalThis.chrome; }
});
