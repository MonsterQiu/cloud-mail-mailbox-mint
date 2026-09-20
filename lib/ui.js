export const $ = selector => document.querySelector(selector);

export async function send(type, data = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请从 Chrome 扩展打开此页面。');
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || '扩展后台未响应，请重新打开扩展。');
  return response.value;
}

export function notify(message, error = false) {
  const element = $('#notice');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}

export async function copy(text) {
  if (!text) return notify('这条记录没有保存密码。', true);
  try { await navigator.clipboard.writeText(text); notify('已复制到剪贴板。'); }
  catch { notify('复制失败，请选择文字后手动复制。', true); }
}

export function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function button(text, action, className = 'small-button') {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = text; element.className = className;
  element.addEventListener('click', () => Promise.resolve().then(action).catch(error => notify(error.message, true)));
  return element;
}

export function shortDate(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export async function confirmAction(title, message, label = '确认') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-yes').textContent = label;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true }));
}
