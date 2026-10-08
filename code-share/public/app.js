const $ = value => document.querySelector(value);
const shareId = location.pathname.match(/^\/s\/([a-f0-9]{32})\/?$/)?.[1];
let grant, timer, deadline = 0, started = 0, generation = 0, watching = false, querying = false;
function notice(message = '', success = false) { $('#notice').textContent = message; $('#notice').hidden = !message; $('#notice').classList.toggle('success',success); }
function watchStatus(message = '') { $('#watch-status').textContent = message; $('#watch-status').hidden = !message; }
function stop(message = '') {
  clearTimeout(timer); timer = null; watching = false; deadline = 0; generation++;
  $('#wait').textContent = '等待新验证码'; watchStatus(message);
}
function locked(message = '') {
  stop(); grant = null; $('#inbox-panel').hidden = true; $('#login-panel').hidden = false;
  $('#messages').replaceChildren(); $('#mailbox').textContent = ''; $('#expiry').textContent = '';
  $('#connection').textContent = '待验证'; $('#connection').classList.remove('ready'); notice(message);
}
function fullDate(value) { return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)); }
function mailDate(value) { const utc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ','T')+'Z' : value; return fullDate(utc)+' 北京时间'; }
function unlocked(value) {
  if (value.id !== shareId) return locked();
  grant = value; $('#login-panel').hidden = true; $('#inbox-panel').hidden = false;
  $('#mailbox').textContent = value.email; $('#expiry').textContent = `有效期至 ${fullDate(value.expiresAt)} 北京时间`;
  $('#connection').textContent = '已验证'; $('#connection').classList.add('ready'); notice();
}
async function api(path, body) {
  const abort = new AbortController(); const timeout = setTimeout(()=>abort.abort(),15000);
  try {
    const response = await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal});
    const value = await response.json();
    if (!response.ok) { const error = new Error(value.error || '查询失败，请稍后重试。'); error.status = response.status; error.retryAfter = Number(response.headers.get('Retry-After')) || 5; throw error; }
    return value;
  } finally { clearTimeout(timeout); }
}
function render(messages) {
  const list = $('#messages'); list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const title = document.createElement('h2'); title.textContent = '暂无新验证码';
    empty.append(title); list.append(empty); return;
  }
  for (const mail of messages) {
    const card = document.createElement('article'); card.className = 'message';
    const meta = document.createElement('div'); meta.className = 'message-meta';
    const sender = document.createElement('span'); sender.textContent = mail.sender || '新邮件';
    const time = document.createElement('time'); try { time.textContent = mailDate(mail.receivedAt); } catch { time.textContent = '时间未知'; }
    meta.append(sender,time); card.append(meta);
    if (mail.codes.length) {
      const codes = document.createElement('div'); codes.className = 'codes';
      for (const value of mail.codes) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'code'; button.textContent = value; button.title = '点击复制验证码';
        button.addEventListener('click',async()=>{try { await navigator.clipboard.writeText(value); notice('验证码已复制。',true); } catch { notice('复制失败，请选择验证码后手动复制。'); }});
        codes.append(button);
      }
      card.append(codes);
    } else { const hint = document.createElement('p'); hint.className = 'no-code'; hint.textContent = '未识别到验证码'; card.append(hint); }
    list.append(card);
  }
}
async function query(token) {
  if (querying) return null;
  querying = true; $('#refresh').disabled = true;
  try {
    const value = await api('/api/codes');
    if (token !== generation) return null;
    if (value.email !== grant?.email) throw new Error('邮箱授权不一致，请重新验证。');
    render(value.messages); return value;
  } finally { querying = false; $('#refresh').disabled = false; }
}
function failed(error) {
  if ([401,403].includes(error.status)) locked(error.message);
  else { stop('查询已停止。'); notice(error.name === 'AbortError' ? '查询超时，请点击刷新重试。' : error.message); }
}
async function poll(token) {
  try {
    const value = await query(token); if (!value || token !== generation) return;
    if (value.messages.some(mail=>mail.codes.length)) { stop(); return; }
    const remaining = deadline-Date.now(); if (remaining<=0) { stop('等待已结束，您可以再次刷新或等待。'); return; }
    const elapsed = Date.now()-started; const delay=Math.min(elapsed<30000?5000:elapsed<60000?10000:15000,remaining);
    watchStatus(`等待中 · ${Math.ceil(delay/1000)} 秒后刷新 · 剩余 ${Math.ceil(remaining/1000)} 秒`);
    timer=setTimeout(()=>poll(token),delay);
  } catch(error) {
    if(token!==generation) return;
    if(error.status===429 && deadline>Date.now()) { watchStatus('等待下一次查询…'); timer=setTimeout(()=>poll(token),Math.min(error.retryAfter*1000,15000)); }
    else failed(error);
  }
}
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(!shareId) return;
  $('#login-button').disabled=true; notice();
  try { const value=await api('/api/login',{shareId,passcode:$('#passcode').value.trim()}); $('#passcode').value=''; unlocked(value.grant); }
  catch(error){ failed(error); } finally { $('#login-button').disabled=false; }
});
$('#refresh').addEventListener('click',async()=>{
  stop('正在查询…'); notice(); const token=generation;
  try { const value=await query(token); if(value) watchStatus(); }
  catch(error){ if(token===generation) failed(error); }
});
$('#wait').addEventListener('click',()=>{
  if(watching){ stop('等待已停止。'); return; }
  if(querying){ notice('当前查询尚未完成，请稍候。'); return; }
  notice(); watching=true; started=Date.now(); deadline=started+120000; const token=++generation;
  $('#wait').textContent='停止等待'; watchStatus('正在查询…'); poll(token);
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/logout',{});locked();}catch(error){notice(error.message);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden && watching) stop('页面进入后台，等待已暂停。');});
if(!shareId){$('#login-button').disabled=true;$('#passcode').disabled=true;$('#link-error').hidden=false;}
else api('/api/session').then(value=>unlocked(value.grant)).catch(error=>{if(error.status!==401)notice(error.message);});
