import { makeApi } from '../lib/api.js';
import { makeStorage } from '../lib/storage.js';
import { makeController } from '../lib/controller.js';

const restricted = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
]);
const controller = makeController({
  storage: makeStorage(chrome.storage.local, chrome.storage.session), api: makeApi(),
  hasPermission: baseUrl => chrome.permissions.contains({ origins: [`${baseUrl}/*`] }),
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const allowedPages = ['popup/popup.html', 'options/options.html'].map(page => chrome.runtime.getURL(page));
  if (sender.id !== chrome.runtime.id || !allowedPages.includes(sender.url?.split('?')[0])) return false;
  restricted.then(() => controller.dispatch(message))
    .then(value => sendResponse({ ok: true, value }), error => sendResponse({ ok: false, error: error.message || '操作失败，请重试。' }));
  return true;
});
