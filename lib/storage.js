import { DEFAULT_CONFIG } from './validation.js';

export function makeStorage(local, session) {
  return {
    async load() {
      const { vault } = await local.get('vault');
      return vault || { version: 1, config: structuredClone(DEFAULT_CONFIG), records: [] };
    },
    save: vault => local.set({ vault }),
    async getDraft() { return (await session.get('draft')).draft || null; },
    setDraft: draft => session.set({ draft }),
  };
}
