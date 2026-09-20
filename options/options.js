import { $, send, notify, confirmAction, shortDate } from '../lib/ui.js';
import { normalizeBaseUrl, normalizeDomains } from '../lib/validation.js';

let config, discoveredDomains = null, busy = false;
function renderStatus() {
  $('#token-state').textContent = config.testedAt ? '已验证连接' : config.hasToken ? 'Token 已保存' : '尚未配置';
  $('#token-state').classList.toggle('success', Boolean(config.testedAt));
  $('#token-hint').textContent = config.hasToken ? 'Token 已保存在后台。留空可保留；填写新值则替换。' : '使用 cloud-mail 的开放 API Token；不能使用网页登录 Token。';
  $('#tested-at').textContent = config.testedAt ? `上次验证 ${shortDate(config.testedAt)}` : '';
}
function syncDomains() {
  const current = $('#default-domain').value;
  const domains = normalizeDomains($('#domains').value);
  $('#default-domain').replaceChildren(...domains.map(domain => new Option(domain, domain)));
  $('#default-domain').value = domains.includes(current) ? current : domains[0];
}
function formValue() {
  return { baseUrl: normalizeBaseUrl($('#base-url').value), token: $('#api-token').value,
    domains: normalizeDomains($('#domains').value), defaultDomain: $('#default-domain').value,
    passwordLength: Number($('#length').value), roleName: $('#role-name').value, savePasswords: $('#save-passwords').checked };
}
// Called directly in the user's click handler, before any awaits (Chrome permission requirement).
function requestPermission() {
  const origin = `${normalizeBaseUrl($('#base-url').value)}/*`;
  return chrome.permissions.request({ origins: [origin] });
}
async function save(permission) {
  if (!await permission) throw new Error('未授予该站点访问权限，设置尚未保存。');
  const value = formValue();
  if (!value.savePasswords && config.savePasswords && !await confirmAction('停止保存密码？', '现有记录中的密码也会从本地移除，请先导出所需凭证。', '移除已存密码')) return false;
  config = await send('save-config', { config: value });
  $('#api-token').value = ''; $('#base-url').value = config.baseUrl; renderStatus();
  return true;
}
async function run(work) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('main button')]; controls.forEach(el => { el.disabled = true; });
  try { await work(); } catch (error) { notify(error.message, true); }
  finally { busy = false; controls.forEach(el => { el.disabled = false; }); }
}
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault(); if (busy || !config) return;
  let permission; try { permission = requestPermission(); } catch (error) { return notify(error.message, true); }
  run(async () => { if (await save(permission)) notify('设置已保存。可以打开扩展创建邮箱了。'); });
});
$('#test-connection').addEventListener('click', () => {
  if (busy || !config || !$('#settings-form').reportValidity()) return;
  let permission; try { permission = requestPermission(); } catch (error) { return notify(error.message, true); }
  run(async () => {
    if (!await save(permission)) return;
    notify('正在验证 Token…');
    let result;
    try { result = await send('test'); }
    catch (error) {
      config = (await send('snapshot')).config;
      renderStatus();
      throw error;
    }
    config = result.config; renderStatus();
    if (result.domains?.length) { discoveredDomains = normalizeDomains(result.domains); $('#use-domains').hidden = false; }
    notify('连接成功，Token 有效。测试没有创建邮箱。');
  });
});
$('#clear-token').addEventListener('click', () => run(async () => {
  if (!await confirmAction('移除本机 Token？', '此浏览器将无法创建邮箱，直到重新配置。服务器上的 Token 和邮箱不受影响。', '移除')) return;
  config = await send('save-config', { config: { ...config, clearToken: true } });
  $('#api-token').value = ''; renderStatus(); notify('本机 Token 已移除。');
}));
$('#domains').addEventListener('change', () => { try { syncDomains(); } catch (error) { notify(error.message, true); } });
$('#base-url').addEventListener('change', () => {
  try {
    if (normalizeBaseUrl($('#base-url').value) !== config.baseUrl) {
      $('#api-token').value = ''; discoveredDomains = null; $('#use-domains').hidden = true;
      notify('站点已变更，请填写这个站点的 Token。旧 Token 不会用于新站点。');
    }
  } catch (error) { notify(error.message, true); }
});
$('#use-domains').addEventListener('click', () => {
  $('#domains').value = discoveredDomains.join('\n'); syncDomains(); notify('已填入检测到的域名，点击保存设置后生效。');
});
$('#token-form').addEventListener('submit', event => {
  event.preventDefault(); if (busy || !config || !$('#settings-form').reportValidity()) return;
  let permission; try { permission = requestPermission(); } catch (error) { return notify(error.message, true); }
  run(async () => {
    try {
      if (!await save(permission)) return;
      if (!await confirmAction('生成新的全局 API Token？', `管理员凭证将发送给 ${config.baseUrl}。生成会替换站点已有 Token，使用旧 Token 的其他工具将失效。`, '生成并保存')) return;
      notify('正在生成 Token…');
      config = await send('generate-token', { credentials: { email: $('#admin-email').value.trim(), password: $('#admin-password').value } });
      renderStatus(); notify('新 Token 已保存。可点击“保存并测试连接”验证。');
    } finally { $('#admin-password').value = ''; }
  });
});

send('snapshot').then(state => {
  config = state.config;
  $('#base-url').value = config.baseUrl; $('#domains').value = config.domains.join('\n'); syncDomains();
  $('#default-domain').value = config.defaultDomain; $('#length').value = config.passwordLength;
  $('#role-name').value = config.roleName; $('#save-passwords').checked = config.savePasswords; renderStatus();
}).catch(error => notify(error.message, true));
