import { DEFAULT_CONFIG } from '../lib/validation.js';
import { makeController } from '../lib/controller.js';
import { makeStorage } from '../lib/storage.js';

export function memoryArea(initial = {}) {
  let data = structuredClone(initial);
  return {
    fail: false,
    async get(key) { return structuredClone({ [key]: data[key] }); },
    async set(value) { if (this.fail) throw new Error('storage full'); data = { ...data, ...structuredClone(value) }; },
    read: () => structuredClone(data),
  };
}

export function fixture(overrides = {}) {
  const local = memoryArea({ vault: { version: 1, config: { ...structuredClone(DEFAULT_CONFIG), token: 'test-token', ...overrides.config }, records: overrides.records || [] } });
  const session = memoryArea();
  const calls = [];
  const api = { create: async (config, mailbox) => { calls.push(mailbox); }, test: async () => null,
    domains: async () => ({ domainList: ['@sisyphusx.com'] }), inbox: async () => [],
    token: async () => ({ token: 'new-token' }), ...overrides.api };
  const storage = makeStorage(local, session);
  const controller = makeController({ storage, api, hasPermission: overrides.hasPermission });
  return { local, session, storage, controller, api, calls };
}

export const draft = () => ({ id: crypto.randomUUID(), prefix: 'test-mail-123456', domain: 'sisyphusx.com', password: 'Strong$Passw0rd1234' });
