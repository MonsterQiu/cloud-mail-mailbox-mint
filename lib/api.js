export class ApiError extends Error {
  constructor(message, kind = 'rejected') { super(message); this.name = 'ApiError'; this.kind = kind; }
}

function safeMessage(message, secrets) {
  let text = typeof message === 'string' ? message : '服务器拒绝了请求。';
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join('[已隐藏]');
  return text.slice(0, 240);
}

export function makeApi(fetchImpl = fetch, timeoutMs = 18000) {
  async function request(config, path, body, { authenticated = true, mutation = false } = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const secrets = [config.token, body?.password, ...(body?.list || []).map(row => row.password)];
    try {
      const response = await fetchImpl(`${config.baseUrl}/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(authenticated ? { Authorization: config.token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: abort.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      });
      let result;
      try { result = await response.json(); }
      catch { throw new ApiError('服务器未返回有效 JSON，请检查站点地址。', mutation ? 'uncertain' : 'rejected'); }
      if (!response.ok || result?.code !== 200) {
        const code = result?.code || response.status;
        if (code === 401 || code === 403) throw new ApiError('Token 无效或权限不足，请在设置中检查。', 'auth');
        const message = safeMessage(result?.message, secrets);
        const duplicate = /已存在|已注册|数据库中存在|exist|SQLITE_CONSTRAINT/i.test(message);
        throw new ApiError(duplicate ? '这个邮箱地址已存在，请换一个名称。' : message,
          duplicate ? 'duplicate' : mutation && (code >= 500) ? 'uncertain' : 'rejected');
      }
      return result.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(mutation
        ? '连接中断或超时，服务端可能已创建邮箱。请保留凭证并去后台核对，勿自动重试。'
        : '连接失败或超时，请检查网络、站点地址及站点权限。', mutation ? 'uncertain' : 'network');
    } finally { clearTimeout(timer); }
  }
  return {
    create: (config, mailbox) => request(config, '/public/addUser', { list: [{ email: mailbox.email,
      password: mailbox.password, ...(config.roleName ? { roleName: config.roleName } : {}) }] }, { mutation: true }),
    // The existing addUser implementation returns immediately for an empty list. No mailbox is created.
    test: config => request(config, '/public/addUser', { list: [] }),
    domains: config => request(config, '/setting/websiteConfig', undefined, { authenticated: false }),
    inbox: (config, email) => request(config, '/public/emailList', {
      toEmail: email, timeSort: 'desc', num: 1, size: 5, type: 0, isDel: 0,
    }),
    token: (config, credentials) => request(config, '/public/genToken', credentials, { authenticated: false, mutation: true }),
  };
}
