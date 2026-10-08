import { $, send, notify, copy, download, button, shortDate, confirmAction } from '../lib/ui.js';
import { generateDraft, generatePassword, generatePrefix } from '../lib/generator.js';
import { credentialText, toCsv } from '../lib/csv.js';
import { WATCH_DURATION_MS, nextPollDelay, latestEmailId, mailsAfter, recentMails, mailTimestamp, mailFreshness, formatBeijingMailDate } from '../lib/inbox-policy.js';

let state, draft, result, busy = false, visibleCount = 30;
let codeTimer = null, codeDeadline = 0, codeWatching = false, codeGeneration = 0;
let codeStartedAt = 0, codeBaselineId = 0, codePollCount = 0;
const statusLabels = { created: '创建成功', failed: '未创建', uncertain: '待核对', pending: '创建中' };

function readDraft() {
  return { ...draft, prefix: $('#prefix').value.trim().toLowerCase(), domain: $('#domain').value, password: $('#password').value };
}
function preview() {
  $('#email-preview').textContent = `${$('#prefix').value.trim().toLowerCase()}@${$('#domain').value}`;
  $('#password-length').textContent = `${$('#password').value.length} 位强密码`;
}
function fillDraft(value) {
  draft = value;
  $('#prefix').value = draft.prefix; $('#domain').value = draft.domain; $('#password').value = draft.password;
  $('#password').type = 'password'; $('#toggle-password').textContent = '显示'; $('#toggle-password').setAttribute('aria-pressed', 'false');
  $('#toggle-password').setAttribute('aria-label', '显示密码');
  preview();
}
function newDraft() {
  fillDraft(generateDraft(state.config));
  result = null; $('#receipt').hidden = true; $('#create-form').hidden = !state.config.hasToken; notify('');
  $('#setup-banner').hidden = state.config.hasToken;
  $('main').scrollTop = 0;
  if (state.config.hasToken) $('#prefix').focus({ preventScroll: true });
  return send('draft', { draft });
}
function renderConfig() {
  const config = state.config;
  $('#site-name').textContent = new URL(config.baseUrl).hostname;
  $('#connection-status').textContent = config.testedAt ? '已验证连接' : config.hasToken ? '已配置' : '待配置';
  $('#connection-status').classList.toggle('ready', Boolean(config.testedAt));
  $('#setup-banner').hidden = config.hasToken || Boolean(result);
  $('#loading-state').hidden = true;
  $('#create-form').hidden = !config.hasToken || Boolean(result);
  $('#create-button').disabled = busy || !config.hasToken;
  $('#create-watch-button').disabled = busy || !config.hasToken;
  $('#record-count').textContent = state.records.length;
  $('#save-note').textContent = config.savePasswords ? '账号与密码保存在此浏览器，不同步到云端。' : '密码仅保留在当前浏览器会话中，请及时复制。';
  $('#domain').replaceChildren(...config.domains.map(domain => new Option(`@${domain}`, domain)));
}
function showResult(value) {
  result = value;
  const success = value.status === 'created';
  $('#setup-banner').hidden = true;
  $('#create-form').hidden = true; $('#receipt').hidden = false;
  $('#receipt-status').textContent = statusLabels[value.status]; $('#receipt-status').className = `tag ${success ? 'success' : 'uncertain'}`;
  $('#receipt-time').textContent = shortDate(value.createdAt);
  $('#receipt-heading').textContent = success ? '邮箱创建成功' : '创建结果待核对';
  $('#receipt-message').textContent = success
    ? state.config.savePasswords ? '凭证已保存在记录中，交给对方后可自行改密。' : '密码未写入长期记录，请立即复制。'
    : value.message;
  $('#result-email').textContent = value.email; $('#result-password').textContent = value.password ? '••••••••••••••••••' : '未保存';
  $('#result-reveal').textContent = '显示密码'; $('#result-reveal').setAttribute('aria-pressed', 'false');
  $('#result-link').href = `${value.loginUrl}/`; $('#result-link').textContent = `${value.loginUrl}/`;
  $('main').scrollTop = 0;
  $('#receipt-heading').focus({ preventScroll: true });
}
function renderHistory() {
  const query = $('#search').value.trim().toLowerCase();
  const records = state.records.filter(row => row.email.toLowerCase().includes(query));
  const list = $('#history-list'); list.replaceChildren();
  for (const record of records.slice(0, visibleCount)) {
    const item = document.createElement('article'); item.className = 'record';
    const meta = document.createElement('div'); meta.className = 'record-meta';
    const tag = document.createElement('span'); tag.className = `tag ${record.status === 'created' ? 'success' : record.status}`; tag.textContent = statusLabels[record.status];
    const time = document.createElement('time'); time.textContent = shortDate(record.createdAt); time.dateTime = record.createdAt;
    meta.append(tag, time);
    const email = document.createElement('p'); email.className = 'record-email mono'; email.textContent = record.email;
    const host = document.createElement('p'); host.className = 'login-host'; host.textContent = record.loginUrl;
    const password = document.createElement('p'); password.className = 'record-password mono'; password.hidden = true; password.textContent = record.password || '密码未保存';
    const actions = document.createElement('div'); actions.className = 'record-buttons';
    const reveal = button('显示密码', () => { password.hidden = !password.hidden; reveal.textContent = password.hidden ? '显示密码' : '隐藏密码'; });
    actions.append(button('复制邮箱', () => copy(record.email)), button('复制密码', () => copy(record.password)), button('复制全部', () => copy(credentialText(record))), reveal,
      button('删除', async () => {
        if (await confirmAction('删除这条本地记录？', `${record.email} 的本地凭证将被移除，服务器上的邮箱不受影响。`, '删除记录')) {
          await send('delete-record', { id: record.id }); await refresh();
        }
      }, 'small-button danger'));
    item.append(meta, email, host, password, actions);
    if (record.message) { const p = document.createElement('p'); p.className = 'record-message'; p.textContent = record.message; item.append(p); }
    list.append(item);
  }
  if (!records.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const symbol = document.createElement('div'); symbol.className = 'envelope'; symbol.textContent = '✉';
    const title = document.createElement('strong'); title.textContent = query ? '没有找到这个邮箱' : '第一份凭证，等您创建';
    const text = document.createElement('p'); text.className = 'hint'; text.textContent = query ? '试试邮箱名的一部分。' : '创建的邮箱会按时间保存在这里。';
    empty.append(symbol, title, text); list.append(empty);
  }
  $('#show-more').hidden = records.length <= visibleCount;
  for (const id of ['export-csv', 'export-json', 'clear-history']) $(`#${id}`).disabled = !state.records.length;
}
function renderCodeAddresses() {
  const select = $('#code-address-select');
  const previous = select.value;
  const pinned = state.config.pinnedInboxes || [];
  const created = [...new Set(state.records
    .filter(row => ['created', 'uncertain'].includes(row.status) && row.loginUrl === state.config.baseUrl &&
      state.config.domains.includes(row.email.split('@')[1]) && !pinned.includes(row.email))
    .map(row => row.email))];
  const group = (label, emails) => {
    const element = document.createElement('optgroup'); element.label = label;
    element.append(...emails.map(email => new Option(email, email))); return element;
  };
  const addresses = [...pinned, ...created];
  select.replaceChildren(...(pinned.length ? [group('固定邮箱', pinned)] : []),
    ...(created.length ? [group('创建记录', created)] : []), new Option('手动输入其他邮箱…', '__manual__'));
  const preferred = state.config.preferredInbox;
  select.value = addresses.includes(preferred) ? preferred : addresses.includes(previous) || previous === '__manual__'
    ? previous : addresses[0] || '__manual__';
  $('#manual-email-wrap').hidden = select.value !== '__manual__';
  renderPinButton();
}
function selectedCodeEmail() {
  return $('#code-address-select').value === '__manual__' ? $('#code-email').value.trim() : $('#code-address-select').value;
}
function renderPinButton() {
  const email = selectedCodeEmail().trim().toLowerCase();
  const pinned = (state.config.pinnedInboxes || []).includes(email);
  $('#pin-inbox').textContent = pinned ? '取消固定' : '固定此邮箱';
  $('#pin-inbox').disabled = !email;
}
function resetCodeResults() {
  stopCodeWatch('邮箱已选择。点击“立即刷新”查看邮件，或等待新验证码。');
  renderInbox({ mails: [] }, '单独查询此邮箱', '只显示当前收件地址的邮件。');
  renderPinButton();
}
function setWatchStatus(message, type = '') {
  $('#watch-status').textContent = message;
  $('#watch-status').className = `watch-status${type ? ` ${type}` : ''}`;
}
function stopCodeWatch(message = '等待已停止。', type = '') {
  if (codeTimer) clearTimeout(codeTimer);
  codeTimer = null; codeDeadline = 0; codeWatching = false; codeStartedAt = 0; codeBaselineId = 0; codePollCount = 0; codeGeneration++;
  $('#watch-code').textContent = '等待收件码';
  $('#watch-code').disabled = false; $('#refresh-code').disabled = false;
  if (message) setWatchStatus(message, type);
}
function renderInbox(payload, emptyTitle = '暂时没有收到邮件', emptyText = '请确认收件地址正确，或继续等待。') {
  const list = $('#code-results'); list.replaceChildren();
  if (!payload.mails.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    const symbol = document.createElement('div'); symbol.className = 'envelope'; symbol.textContent = '✉';
    const title = document.createElement('strong'); title.textContent = emptyTitle;
    const text = document.createElement('p'); text.className = 'hint'; text.textContent = emptyText;
    empty.append(symbol, title, text); list.append(empty); return;
  }
  for (const mail of payload.mails) {
    const card = document.createElement('article'); card.className = 'code-mail';
    const top = document.createElement('div'); top.className = 'code-mail-top';
    const from = document.createElement('span'); from.textContent = mail.fromName || mail.fromEmail || '未知发件人';
    if (mail.fromEmail) from.title = mail.fromEmail;
    const freshness = mailFreshness(mail.createTime);
    const time = document.createElement('time'); time.className = `mail-freshness ${freshness.level}`;
    time.textContent = `${freshness.label} · ${formatBeijingMailDate(mail.createTime)}`;
    const timestamp = mailTimestamp(mail.createTime); if (timestamp !== null) time.dateTime = new Date(timestamp).toISOString();
    top.append(from, time);
    const subject = document.createElement('p'); subject.className = 'code-subject'; subject.textContent = mail.subject;
    const candidates = document.createElement('div'); candidates.className = 'code-candidates';
    for (const candidate of mail.codes) {
      const copyButton = button(candidate.value, () => copy(candidate.value), `code-chip${candidate.confidence === 'possible' ? ' possible' : ''}`);
      copyButton.title = candidate.confidence === 'high' ? '复制验证码' : '可能的验证码，点击复制';
      candidates.append(copyButton);
    }
    card.append(top, subject);
    if (mail.codes.length) card.append(candidates);
    else {
      const noCode = document.createElement('p'); noCode.className = 'no-code'; noCode.textContent = '未识别到明确验证码'; card.append(noCode);
    }
    if (mail.snippet) { const snippet = document.createElement('p'); snippet.className = 'code-snippet'; snippet.textContent = mail.snippet; card.append(snippet); }
    list.append(card);
  }
}
async function queryInbox(generation, shouldRender = true) {
  const email = selectedCodeEmail();
  if (!email) throw new Error('请先选择或输入收件邮箱。');
  $('#refresh-code').disabled = true;
  try {
    const payload = await send('inbox', { email });
    if (generation !== codeGeneration) return null;
    if (shouldRender) renderInbox(payload);
    return payload;
  } finally {
    if (!codeWatching) $('#refresh-code').disabled = false;
  }
}
async function pollInbox(generation) {
  try {
    const payload = await queryInbox(generation, false);
    if (!payload || generation !== codeGeneration) return;
    codePollCount++;
    const newMails = mailsAfter(payload.mails, codeBaselineId);
    if (newMails.length) {
      codeBaselineId = Math.max(codeBaselineId, latestEmailId(newMails));
      renderInbox({ ...payload, mails: newMails });
    }
    const hasHighCode = newMails.some(mail => mail.codes.some(code => code.confidence === 'high'));
    if (hasHighCode) { stopCodeWatch('已找到新验证码，点击验证码即可复制。', 'success'); return; }
    const remaining = codeDeadline - Date.now();
    if (remaining <= 0) { stopCodeWatch('等待结束。您可以点击“立即刷新”继续查询。'); return; }
    const delay = Math.min(nextPollDelay(Date.now() - codeStartedAt), remaining);
    setWatchStatus(`已检查 ${codePollCount} 次 · ${Math.ceil(delay / 1000)} 秒后再查 · 最长剩余 ${Math.ceil(remaining / 1000)} 秒`);
    codeTimer = setTimeout(() => pollInbox(generation), delay);
  } catch (error) {
    stopCodeWatch(error.message, 'error');
  }
}
function startCodeWatch() {
  if (codeWatching) { stopCodeWatch('等待已停止。'); return; }
  if (!selectedCodeEmail()) throw new Error('请先选择或输入收件邮箱。');
  codeWatching = true; codeStartedAt = Date.now(); codeDeadline = codeStartedAt + WATCH_DURATION_MS; codePollCount = 0;
  const generation = ++codeGeneration;
  $('#watch-code').textContent = '停止等待'; $('#refresh-code').disabled = true;
  setWatchStatus('正在记录现有邮件，只等待之后收到的新邮件…');
  return queryInbox(generation, false).then(payload => {
    if (!payload || generation !== codeGeneration) return;
    codePollCount++;
    const justArrived = recentMails(payload.mails, codeStartedAt)
      .filter(mail => mail.codes.some(code => code.confidence === 'high'));
    if (justArrived.length) {
      renderInbox({ ...payload, mails: justArrived });
      stopCodeWatch('已找到刚刚收到的验证码，点击即可复制。', 'success');
      return;
    }
    codeBaselineId = latestEmailId(payload.mails);
    renderInbox({ mails: [] }, '等待新邮件', '现有邮件已记住，只显示开始等待后收到的内容。');
    const delay = nextPollDelay(0);
    setWatchStatus(`基线已建立 · ${delay / 1000} 秒后检查新邮件`);
    codeTimer = setTimeout(() => pollInbox(generation), delay);
  }).catch(error => stopCodeWatch(error.message, 'error'));
}
async function refresh() {
  state = await send('snapshot');
  const value = draft ? readDraft() : state.draft;
  renderConfig(); fillDraft(state.config.domains.includes(value.domain) ? value : state.draft); renderHistory(); renderCodeAddresses();
}
function on(selector, event, handler) {
  $(selector).addEventListener(event, e => Promise.resolve().then(() => handler(e)).catch(error => notify(error.message, true)));
}
function selectTab(tab) {
  $('#create-panel').hidden = tab !== 'create'; $('#history-panel').hidden = tab !== 'history'; $('#codes-panel').hidden = tab !== 'codes';
  for (const [id, active] of [['create-tab', tab === 'create'], ['history-tab', tab === 'history'], ['codes-tab', tab === 'codes']]) {
    $(`#${id}`).classList.toggle('active', active); $(`#${id}`).setAttribute('aria-pressed', String(active));
  }
  if (tab !== 'codes' && codeWatching) stopCodeWatch('等待已停止。');
  notify(''); $('main').scrollTop = 0; if (tab === 'history') renderHistory();
  if (tab === 'codes') {
    renderCodeAddresses();
    ($('#code-address-select').value === '__manual__' ? $('#code-email') : $('#code-address-select')).focus({ preventScroll: true });
  }
}

on('#settings', 'click', () => chrome.runtime.openOptionsPage());
on('#setup', 'click', () => chrome.runtime.openOptionsPage());
on('#create-tab', 'click', () => selectTab('create')); on('#history-tab', 'click', () => selectTab('history')); on('#codes-tab', 'click', () => selectTab('codes'));
on('#shuffle-all', 'click', newDraft); on('#next-mailbox', 'click', newDraft);
on('#shuffle-name', 'click', async () => { $('#prefix').value = generatePrefix(); draft = { ...readDraft(), id: crypto.randomUUID() }; preview(); await send('draft', { draft }); });
on('#shuffle-password', 'click', async () => { $('#password').value = generatePassword(state.config.passwordLength); draft = { ...readDraft(), id: crypto.randomUUID() }; preview(); await send('draft', { draft }); });
for (const id of ['prefix', 'domain', 'password']) {
  on(`#${id}`, 'input', () => { preview(); });
  on(`#${id}`, 'change', async () => { draft = { ...readDraft(), id: crypto.randomUUID() }; await send('draft', { draft }); });
}
on('#toggle-password', 'click', () => {
  const visible = $('#password').type === 'password'; $('#password').type = visible ? 'text' : 'password';
  $('#toggle-password').textContent = visible ? '隐藏' : '显示'; $('#toggle-password').setAttribute('aria-pressed', String(visible));
  $('#toggle-password').setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
});
on('#result-reveal', 'click', () => {
  const visible = $('#result-reveal').getAttribute('aria-pressed') !== 'true';
  $('#result-password').textContent = visible ? result.password || '未保存' : '••••••••••••••••••';
  $('#result-reveal').setAttribute('aria-pressed', String(visible)); $('#result-reveal').textContent = visible ? '隐藏密码' : '显示密码';
});
async function createMailbox(watchAfterCreate = false) {
  if (busy || !$('#create-form').reportValidity()) return;
  busy = true; notify(''); $('#create-button').disabled = true; $('#create-label').textContent = '正在创建…';
  $('#create-watch-button').disabled = true; $('#create-watch-label').textContent = '正在创建…';
  const fields = [...$('#create-form').querySelectorAll('input, select, button')]; fields.forEach(el => { el.disabled = true; });
  try {
    const value = await send('create', { draft: readDraft() });
    await refresh();
    if (value.status === 'failed') notify(value.message, true);
    else if (watchAfterCreate && value.status === 'created') {
      result = null;
      selectTab('codes');
      $('#code-address-select').value = value.email;
      $('#manual-email-wrap').hidden = true;
      state.config = await send('select-inbox', { email: value.email }); renderPinButton();
      setWatchStatus('邮箱已创建，正在建立新邮件基线…');
      await startCodeWatch();
    } else showResult(value);
  } catch (error) { notify(error.message, true); }
  finally {
    busy = false; fields.forEach(el => { el.disabled = false; });
    $('#create-button').disabled = !state?.config.hasToken; $('#create-watch-button').disabled = !state?.config.hasToken;
    $('#create-label').textContent = '创建邮箱'; $('#create-watch-label').textContent = '创建并等待验证码';
  }
}
// Prevent submission synchronously; extension pages never navigate with form contents.
$('#create-form').addEventListener('submit', event => {
  event.preventDefault(); return createMailbox(false);
});
on('#create-watch-button', 'click', () => createMailbox(true));
on('#copy-email', 'click', () => copy(result.email)); on('#copy-password', 'click', () => copy(result.password)); on('#copy-all', 'click', () => copy(credentialText(result)));
on('#search', 'input', () => { visibleCount = 30; renderHistory(); });
on('#show-more', 'click', () => { visibleCount += 30; renderHistory(); });
on('#watch-code', 'click', startCodeWatch);
on('#refresh-code', 'click', async () => {
  if (codeWatching) stopCodeWatch('', '');
  const generation = ++codeGeneration; setWatchStatus('正在查询最新邮件…');
  try {
    const payload = await queryInbox(generation);
    if (!payload) return;
    const found = payload.mails.some(mail => mail.codes.length);
    setWatchStatus(found ? '查询完成，点击验证码即可复制。' : '查询完成，暂未识别到验证码。', found ? 'success' : '');
  } catch (error) { setWatchStatus(error.message, 'error'); }
});
on('#code-address-select', 'change', async () => {
  $('#manual-email-wrap').hidden = $('#code-address-select').value !== '__manual__';
  resetCodeResults();
  if ($('#code-address-select').value === '__manual__') $('#code-email').focus({ preventScroll: true });
  state.config = await send('select-inbox', { email: $('#code-address-select').value === '__manual__' ? '' : selectedCodeEmail() });
});
on('#code-email', 'input', resetCodeResults);
on('#pin-inbox', 'click', async () => {
  const email = selectedCodeEmail().trim().toLowerCase();
  const pinned = (state.config.pinnedInboxes || []).includes(email);
  state.config = await send(pinned ? 'unpin-inbox' : 'pin-inbox', { email });
  renderCodeAddresses(); resetCodeResults();
  notify(pinned ? '已取消本机固定，服务器邮箱保留。' : '已固定到收件邮箱列表，重开插件仍可直接选择。');
});
for (const format of ['csv', 'json']) on(`#export-${format}`, 'click', async () => {
  if (!await confirmAction('导出本地记录？', format === 'csv'
    ? '文件包含已保存的密码，请妥善保管。CSV 会为公式样式的内容添加保护前缀；需要原样密码请用 JSON 备份。'
    : '文件包含已保存的密码，请妥善保管。JSON 保留完整原始凭证。', '导出')) return;
  const text = format === 'csv' ? toCsv(state.records) : JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: state.records }, null, 2);
  download(text, `cloud-mail-${new Date().toISOString().slice(0, 10)}.${format}`, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json');
  notify('已提交下载，请查看浏览器下载记录。');
});
on('#clear-history', 'click', async () => {
  if (await confirmAction('清空所有本地记录？', `将移除 ${state.records.length} 条记录及保存的密码。服务器上的邮箱不受影响，建议先导出备份。`, '清空记录')) {
    await send('clear-records'); await refresh(); notify('本地记录已清空。');
  }
});

refresh().then(() => {
  const previous = state.records.find(row => row.id === state.draft.id && ['created', 'uncertain', 'pending'].includes(row.status));
  if (previous) showResult({ ...previous, password: previous.password ?? state.draft.password });
}).catch(error => { $('#loading-state').hidden = true; notify(error.message, true); });
