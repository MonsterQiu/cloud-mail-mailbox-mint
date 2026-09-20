const KEYWORD_RE = /验证码|校验码|动态码|登录码|登陆码|安全码|认证码|确认码|一次性密码|verification\s*code|security\s*code|login\s*code|confirmation\s*code|one[ -]?time\s*(?:password|code)|passcode|otp|2fa|pin\s*code/i;
const NEGATIVE_RE = /订单|单号|金额|价格|快递|物流|电话|手机|客服|order|invoice|amount|price|tracking|phone|support/i;

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? ' ';
    const hex = entity[1].toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' ';
  });
}

export function plainText(value = '') {
  return decodeEntities(String(value).slice(0, 200000)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\u200b-\u200f\ufeff\u00ad]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCandidate(raw) {
  return raw.replace(/[\s-]/g, '');
}

function candidateScore(value, raw, context, source) {
  let score = 0;
  if (KEYWORD_RE.test(context)) score += 65;
  if (source === 'subject') score += 28;
  if (/^\d+$/.test(value)) score += 12;
  if (value.length === 6) score += 18;
  else if ([4, 5, 7, 8].includes(value.length)) score += 9;
  if (/^[a-z]+$/i.test(value) || /^\d+$/.test(value)) score += 2;
  if (/^(?:19|20)\d{2}$/.test(value)) score -= 90;
  if (NEGATIVE_RE.test(context)) score -= 45;
  if (/\b(?:usd|cny|rmb|eur|gbp|\$|¥|￥)\s*$/i.test(context.slice(0, Math.max(0, context.indexOf(raw))))) score -= 40;
  return score;
}

export function extractCodeCandidates(mail = {}) {
  const subject = plainText(mail.subject).slice(0, 500);
  const body = plainText(mail.text || mail.content).slice(0, 12000);
  const found = new Map();

  for (const [source, text] of [['subject', subject], ['body', body]]) {
    const matches = [
      ...text.matchAll(/(?<![a-z0-9])\d(?:[\s-]?\d){3,7}(?![a-z0-9])/gi),
      ...text.matchAll(/(?<![a-z0-9])(?=[a-z0-9-]{4,10}(?![a-z0-9]))(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z0-9]+(?:-[a-z0-9]+)*(?![a-z0-9])/gi),
    ];
    for (const match of matches) {
      const value = normalizeCandidate(match[0]);
      if (value.length < 4 || value.length > 8) continue;
      const start = Math.max(0, match.index - 70);
      const end = Math.min(text.length, match.index + match[0].length + 70);
      const localContext = text.slice(start, end);
      const context = source === 'body' ? `${subject} ${localContext}` : localContext;
      const score = candidateScore(value, match[0], context, source);
      const previous = found.get(value.toUpperCase());
      if (!previous || score > previous.score) found.set(value.toUpperCase(), { value, score, source });
    }
  }

  return [...found.values()]
    .filter(item => item.score >= 20)
    .sort((a, b) => b.score - a.score || a.value.length - b.value.length)
    .slice(0, 4)
    .map(item => ({ ...item, confidence: item.score >= 70 ? 'high' : 'possible' }));
}

export function summarizeMail(mail = {}) {
  const subject = plainText(mail.subject).slice(0, 160) || '（无主题）';
  const body = plainText(mail.text || mail.content);
  return {
    emailId: Number(mail.emailId) || 0,
    fromEmail: plainText(mail.sendEmail).slice(0, 254),
    fromName: plainText(mail.sendName).slice(0, 100),
    subject,
    toEmail: plainText(mail.toEmail).slice(0, 254),
    createTime: plainText(mail.createTime).slice(0, 40),
    snippet: body.slice(0, 220),
    codes: extractCodeCandidates({ subject, text: body }),
  };
}
