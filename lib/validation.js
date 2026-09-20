export const DEFAULT_CONFIG = Object.freeze({
  baseUrl: 'https://webmail.sisyphusx.com',
  domains: ['sisyphusx.com', 'athinker.net', 'raincanvas.im', '20001015.xyz', 'ymsunv.com'],
  defaultDomain: 'sisyphusx.com', passwordLength: 18, roleName: '', savePasswords: true,
  token: '', testedAt: null,
});

export function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new Error('请输入完整的 HTTPS 站点地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('站点地址须为 HTTPS 根地址，不带路径、端口、账号或查询参数。');
  }
  return url.origin;
}

export function normalizeDomain(value) {
  const domain = String(value).trim().replace(/^@/, '').toLowerCase();
  const labels = domain.split('.');
  if (domain.length > 253 || labels.length < 2 || !/^[a-z]{2,63}$/.test(labels.at(-1)) ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error(`邮箱域名格式不正确：${domain.slice(0, 60)}`);
  }
  return domain;
}

export function normalizeDomains(value) {
  const values = Array.isArray(value) ? value : String(value).split(/[\s,，;；]+/);
  const domains = [...new Set(values.filter(Boolean).map(normalizeDomain))];
  if (!domains.length || domains.length > 50) throw new Error('请填写 1–50 个邮箱域名。');
  return domains;
}

export function validatePrefix(value) {
  const prefix = String(value).trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,28}[a-z0-9])?$/.test(prefix) || prefix.includes('..')) {
    throw new Error('邮箱名须为 1–30 位字母、数字，或中间的点号、连字符；点号不能连续。');
  }
  return prefix;
}

export function validateMailboxAddress(value, allowedDomains) {
  const input = String(value).trim().toLowerCase();
  const parts = input.split('@');
  if (parts.length !== 2) throw new Error('请输入完整邮箱地址。');
  const prefix = validatePrefix(parts[0]);
  const domain = normalizeDomain(parts[1]);
  if (allowedDomains && !allowedDomains.includes(domain)) throw new Error('这个邮箱域名不在当前可用域名列表中。');
  return `${prefix}@${domain}`;
}

export function passwordLength(value) {
  const length = Number(value);
  if (!Number.isInteger(length) || length < 12 || length > 30) throw new Error('密码长度须为 12–30 位。');
  return length;
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 30 || !/^[\x21-\x7e]+$/.test(value) ||
      !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^a-zA-Z0-9]/.test(value)) {
    throw new Error('密码须为 12–30 位，包含大小写字母、数字和符号，不含空格。');
  }
  return value;
}

export function validateToken(value) {
  const token = String(value ?? '').trim();
  if (token && (!/^[\x21-\x7e]+$/.test(token) || token.length > 4096 || /^Bearer\s/i.test(token))) {
    throw new Error('请粘贴 Token 本身，不要添加 Bearer 前缀或空格。');
  }
  return token;
}

export function normalizeConfig(input, previous = DEFAULT_CONFIG) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const domains = normalizeDomains(input.domains);
  const defaultDomain = normalizeDomain(input.defaultDomain || domains[0]);
  if (!domains.includes(defaultDomain)) throw new Error('默认域名必须包含在域名列表中。');
  const roleName = String(input.roleName || '').trim();
  if (roleName.length > 50 || /[\r\n\x00-\x1f]/.test(roleName)) throw new Error('角色名称格式不正确。');
  const siteChanged = baseUrl !== previous.baseUrl;
  const token = input.clearToken ? '' : (validateToken(input.token) || (siteChanged ? '' : previous.token));
  return { baseUrl, domains, defaultDomain, token, roleName,
    passwordLength: passwordLength(input.passwordLength), savePasswords: input.savePasswords !== false,
    testedAt: !siteChanged && token === previous.token ? previous.testedAt : null };
}

export function publicConfig(config) {
  const { token, ...rest } = config;
  return { ...rest, hasToken: Boolean(token) };
}
