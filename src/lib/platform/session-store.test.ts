import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sessionStore } from './session-store';

describe('sessionStore', () => {
  beforeEach(() => fakeBrowser.reset());

  it('round-trips through storage.session when the browser has one', async () => {
    const store = sessionStore('saved-state');
    await store.write({ 'https://example.com/a': { held: true, at: 10 } });

    expect(await store.read()).toEqual({
      'https://example.com/a': { held: true, at: 10 },
    });
  });

  it('answers an empty record before anything was written', async () => {
    expect(await sessionStore('saved-state').read()).toEqual({});
  });

  it('keeps working where there is no storage.session', async () => {
    // Firefox before 115, and anything else that lacks it. The badge
    // still works; it just forgets when the context does.
    const storage = fakeBrowser.storage as unknown as Record<string, unknown>;
    const area = storage['session'];
    delete storage['session'];
    try {
      const store = sessionStore('saved-state');
      await store.write({ 'https://example.com/b': { held: false, at: 3 } });
      expect(await store.read()).toEqual({
        'https://example.com/b': { held: false, at: 3 },
      });
    } finally {
      storage['session'] = area;
    }
  });
});
