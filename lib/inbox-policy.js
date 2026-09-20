export const WATCH_DURATION_MS = 120000;

export function nextPollDelay(elapsedMs) {
  if (elapsedMs < 30000) return 5000;
  if (elapsedMs < 60000) return 10000;
  return 15000;
}

export function latestEmailId(mails = []) {
  return mails.reduce((latest, mail) => Math.max(latest, Number(mail.emailId) || 0), 0);
}

export function mailsAfter(mails = [], emailId = 0) {
  return mails.filter(mail => (Number(mail.emailId) || 0) > emailId);
}

export function mailTimestamp(value) {
  const text = String(value || '').trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatBeijingMailDate(value) {
  const timestamp = mailTimestamp(value);
  if (timestamp === null) return '时间未知';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute} 北京时间`;
}

export function recentMails(mails = [], startedAt, toleranceMs = 30000) {
  return mails.filter(mail => {
    const timestamp = mailTimestamp(mail.createTime);
    return timestamp !== null && timestamp >= startedAt - toleranceMs;
  });
}

export function mailFreshness(value, now = Date.now()) {
  const timestamp = mailTimestamp(value);
  if (timestamp === null) return { label: '时间未知', level: 'unknown' };
  const age = Math.max(0, now - timestamp);
  if (age < 60000) return { label: '刚刚收到', level: 'fresh' };
  if (age < 5 * 60000) return { label: `${Math.max(1, Math.floor(age / 60000))} 分钟前`, level: 'fresh' };
  if (age < 10 * 60000) return { label: `${Math.floor(age / 60000)} 分钟前`, level: 'aging' };
  return { label: '可能已失效', level: 'stale' };
}
