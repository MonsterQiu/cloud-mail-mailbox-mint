const $ = value => document.querySelector(value);
let adminKey = '', createdShare = null, credentials = '';
const date = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', dateStyle:'medium', timeStyle:'short'});
function expiry(value) { return value === null ? '长期有效' : date.format(value) + ' 北京时间'; }
function notice(message = '', success = false) {
  $('#notice').textContent = message; $('#notice').hidden = !message; $('#notice').classList.toggle('success', success);
}
function logout() {
  adminKey = ''; createdShare = null; credentials = '';
  $('#credentials').textContent = ''; $('#created').hidden = true;
  $('#admin-content').hidden = true; $('#admin-login').hidden = false; $('#grants').replaceChildren();
}
function showCreated() {
  credentials = '邮箱：' + createdShare.grant.email + '\n取码链接：' + createdShare.shareUrl +
    '\n访问口令：' + createdShare.passcode + '\n有效期：' + expiry(createdShare.grant.expiresAt);
  $('#credentials').textContent = credentials; $('#created').hidden = false;
}
async function api(path, body) {
  const response = await fetch(path, {
    method:body === undefined ? 'GET' : 'POST',
    headers:{Authorization:'Bearer ' + adminKey, ...(body === undefined ? {} : {'Content-Type':'application/json'})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
    credentials:'omit', cache:'no-store', redirect:'error',
  });
  const value = await response.json();
  if (!response.ok) { if (response.status === 401) logout(); throw new Error(value.error || '操作失败，请重试。'); }
  return value;
}
async function reload() {
  const value = await api('/api/admin/grants'); const list = $('#grants'); list.replaceChildren();
  for (const grant of value.grants) {
    const row = document.createElement('article'); row.className = 'grant';
    const top = document.createElement('div'); top.className = 'grant-top';
    const email = document.createElement('p'); email.textContent = grant.email; top.append(email);
    const action = document.createElement('button'); action.type = 'button'; action.className = 'text-button danger';
    action.textContent = grant.revoked ? '已撤销' : '撤销授权'; action.disabled = grant.revoked;
    action.addEventListener('click', async () => {
      if (!confirm('撤销 ' + (grant.label || grant.email) + ' 的取码权限？')) return;
      action.disabled = true;
      try { await api('/api/admin/grants/' + grant.id + '/revoke', {}); await reload(); notice('已撤销，对方将无法继续取码。', true); }
      catch (error) { notice(error.message); action.disabled = false; }
    });
    top.append(action);
    const note = document.createElement('p'); note.className = 'hint';
    const expired = grant.expiresAt !== null && grant.expiresAt <= Date.now();
    note.textContent = (grant.label ? grant.label + ' · ' : '') +
      (grant.expiresAt === null ? '长期有效' : (expired ? '已到期 · ' : '有效期至 ') + expiry(grant.expiresAt));
    const link = document.createElement('p'); link.className = 'hint'; link.textContent = location.origin + '/s/' + grant.id;
    row.append(top, note, link);
    if (!grant.revoked && grant.expiresAt !== null) {
      const controls = document.createElement('div'); controls.className = 'grant-actions';
      const duration = document.createElement('select');
      duration.setAttribute('aria-label', (grant.label || grant.email) + ' 的延期时长');
      for (const [days, label] of [[30,'延长 30 天'],[180,'延长 180 天'],[365,'延长一年'],[730,'延长两年'],[0,'设为长期有效']]) {
        const option = document.createElement('option'); option.value = String(days); option.textContent = label;
        option.selected = days === 365; duration.append(option);
      }
      const extend = document.createElement('button'); extend.type = 'button'; extend.className = 'secondary'; extend.textContent = '延期';
      extend.addEventListener('click', async () => {
        extend.disabled = true; duration.disabled = true; notice();
        try {
          const updated = await api('/api/admin/grants/' + grant.id + '/extend', {days:Number(duration.value)});
          if (createdShare?.grant.id === grant.id) { createdShare.grant = updated.grant; showCreated(); }
          await reload();
          notice((updated.grant.expiresAt === null ? '已设为长期有效。' : '已延期至 ' + expiry(updated.grant.expiresAt) + '。') + '链接和口令不变。', true);
        } catch (error) { notice(error.message); }
        finally { extend.disabled = false; duration.disabled = false; }
      });
      controls.append(duration, extend); row.append(controls);
    }
    list.append(row);
  }
  if (!value.grants.length) {
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = '还没有分享入口。'; list.append(hint);
  }
}
$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault(); adminKey = $('#admin-key').value; $('#admin-key').value = '';
  try { await reload(); $('#admin-content').hidden = false; $('#admin-login').hidden = true; notice(); }
  catch (error) { adminKey = ''; notice(error.message); }
});
$('#create-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#create-button').disabled = true; notice();
  try {
    createdShare = await api('/api/admin/grants', {email:$('#email').value.trim(), label:$('#label').value.trim(), days:Number($('#days').value)});
    showCreated(); await reload(); notice('分享入口已创建。', true);
  } catch (error) { notice(error.message); }
  finally { $('#create-button').disabled = false; }
});
$('#copy-share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(credentials); notice('链接和口令已复制。', true); }
  catch { notice('复制失败，请手动选择文字复制。'); }
});
$('#reload-grants').addEventListener('click', () => reload().catch(error => notice(error.message)));
$('#admin-logout').addEventListener('click', () => { logout(); notice(); });
