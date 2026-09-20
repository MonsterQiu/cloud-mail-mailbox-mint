import { DEFAULT_CONFIG, normalizeConfig, publicConfig, validatePrefix, normalizeDomain, validatePassword, validateMailboxAddress } from './validation.js';
import { generateDraft } from './generator.js';
import { summarizeMail } from './code-extractor.js';

export function makeController({ storage, api, hasPermission = async () => true, now = () => new Date().toISOString() }) {
  let vault;
  let tail = Promise.resolve();
  let creating = false;
  const ready = (async () => {
    vault = await storage.load();
    vault.config = { ...structuredClone(DEFAULT_CONFIG), ...vault.config };
    let recovered = false;
    for (const record of vault.records) {
      if (record.status === 'pending') {
        record.status = 'uncertain';
        record.message = '上次请求未完成确认，请到邮箱后台核对。';
        recovered = true;
      }
    }
    if (recovered) await storage.save(vault);
  })();

  async function persist(next) {
    await storage.save(next);
    vault = next;
  }
  async function allowed(config, requireToken = true) {
    if (requireToken && !config.token) throw new Error('先打开设置，填写 API Token。');
    if (!await hasPermission(config.baseUrl)) throw new Error('此站点尚未授权，请在设置中保存并授予访问权限。');
  }
  async function snapshot() {
    let draft = await storage.getDraft();
    if (!draft || !vault.config.domains.includes(draft.domain)) {
      draft = generateDraft(vault.config);
      await storage.setDraft(draft);
    }
    return { config: publicConfig(vault.config), records: vault.records, draft };
  }

  async function handle(message) {
    await ready;
    switch (message.type) {
      case 'snapshot': return snapshot();
      case 'draft': {
        const draft = message.draft || generateDraft(vault.config);
        await storage.setDraft(draft);
        return draft;
      }
      case 'save-config': {
        const config = normalizeConfig(message.config, vault.config);
        await allowed(config, false);
        // Turning storage off removes existing saved passwords as well.
        const records = config.savePasswords ? vault.records : vault.records.map(row => ({ ...row, password: null }));
        await persist({ ...vault, config, records });
        return publicConfig(config);
      }
      case 'test': {
        const config = vault.config;
        await allowed(config);
        try { await api.test(config); }
        catch (error) {
          await persist({ ...vault, config: { ...config, testedAt: null } });
          throw error;
        }
        await persist({ ...vault, config: { ...config, testedAt: now() } });
        let domains = null;
        try { domains = (await api.domains(config))?.domainList || null; } catch { /* Auth test already passed. */ }
        return { config: publicConfig(vault.config), domains };
      }
      case 'generate-token': {
        const config = vault.config;
        await allowed(config, false);
        const { email, password } = message.credentials || {};
        if (!email || !password) throw new Error('请输入管理员邮箱和密码。');
        const data = await api.token(config, { email, password });
        if (typeof data?.token !== 'string' || !data.token.trim()) throw new Error('服务端未返回 Token。');
        await persist({ ...vault, config: { ...config, token: data.token, testedAt: null } });
        return publicConfig(vault.config);
      }
      case 'create': {
        const config = vault.config;
        await allowed(config);
        const draft = message.draft;
        if (!draft || !/^[a-f0-9-]{36}$/i.test(draft.id || '')) throw new Error('生成信息已失效，请重新生成。');
        const existing = vault.records.find(row => row.id === draft.id);
        if (existing?.status === 'created') return existing;
        if (existing && ['uncertain', 'pending'].includes(existing.status)) throw new Error('这次创建结果待核对，请先检查后台和历史记录。');
        const prefix = validatePrefix(draft.prefix);
        const domain = normalizeDomain(draft.domain);
        if (!config.domains.includes(domain)) throw new Error('该域名不在设置的可用域名列表中。');
        const password = validatePassword(draft.password);
        const email = `${prefix}@${domain}`;
        if (vault.records.some(row => row.id !== draft.id && row.email === email && row.loginUrl === config.baseUrl && ['created', 'uncertain', 'pending'].includes(row.status))) {
          throw new Error('本地已有这个邮箱的创建记录，请先查看记录。');
        }
        if (!existing && vault.records.length >= 5000) throw new Error('本地已有 5000 条记录，请先导出备份并清理。');
        await storage.setDraft({ ...draft, prefix, domain, password });
        const record = { id: draft.id, email, password: config.savePasswords ? password : null,
          loginUrl: config.baseUrl, createdAt: now(), status: 'pending', message: '' };
        const rest = vault.records.filter(row => row.id !== draft.id);
        // Persist credentials before the network request. A full disk cannot create an unrecorded mailbox.
        await persist({ ...vault, records: [record, ...rest] });
        let outcome;
        try {
          await api.create(config, { email, password });
          outcome = { ...record, status: 'created', message: '' };
        } catch (error) {
          outcome = { ...record, status: error.kind === 'uncertain' ? 'uncertain' : 'failed', message: error.message };
        }
        try { await persist({ ...vault, records: [outcome, ...rest] }); }
        catch { throw new Error('请求已发出，但最终状态未能保存。凭证已预存，请到后台核对后再操作。'); }
        return { ...outcome, password };
      }
      case 'inbox': {
        const config = vault.config;
        await allowed(config);
        const email = validateMailboxAddress(message.email, config.domains);
        const rows = await api.inbox(config, email);
        if (!Array.isArray(rows)) throw new Error('邮件接口返回格式不正确。');
        return { email, checkedAt: now(), mails: rows.slice(0, 5).map(summarizeMail) };
      }
      case 'delete-record': {
        await persist({ ...vault, records: vault.records.filter(row => row.id !== message.id) });
        return true;
      }
      case 'clear-records': await persist({ ...vault, records: [] }); return true;
      default: throw new Error('不支持的操作。');
    }
  }

  return {
    dispatch(message) {
      const isCreate = message.type === 'create';
      if (isCreate && creating) return Promise.reject(new Error('正在创建邮箱，请稍候。'));
      if (isCreate) creating = true;
      const job = tail.then(() => handle(message));
      tail = job.catch(() => {});
      return job.finally(() => { if (isCreate) creating = false; });
    },
  };
}
