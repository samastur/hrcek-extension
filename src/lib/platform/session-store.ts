import { browser } from 'wxt/browser';
import type { Entry } from '../saved-state';

/**
 * Somewhere to keep answers that must not outlive the browser. Rung
 * three of the browser ladder: `storage.session` is memory-resident and
 * never written to disk, which is exactly right here — but Chrome's MV3
 * worker needs it and an older Firefox does not have it, and no
 * build-time switch can tell which is which.
 */
export interface StateStore {
  read(): Promise<Record<string, Entry>>;
  write(entries: Record<string, Entry>): Promise<void>;
}

interface SessionArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sessionArea(): SessionArea | undefined {
  const storage = browser.storage as unknown as { session?: SessionArea };
  return storage.session;
}

export function sessionStore(key: string): StateStore {
  const area = sessionArea();
  if (area === undefined) {
    // Nothing persistent to use, which is exactly what this code did
    // before session storage existed.
    let memory: Record<string, Entry> = {};
    return {
      read: async () => memory,
      write: async (entries) => {
        memory = entries;
      },
    };
  }
  return {
    async read() {
      const stored = await area.get(key);
      return (stored[key] as Record<string, Entry> | undefined) ?? {};
    },
    async write(entries) {
      await area.set({ [key]: entries });
    },
  };
}
