import { storage } from '#imports';

export type AuthMode = 'token' | 'session';

export interface Settings {
  /** Base address of the Hrček server, no trailing slash. */
  serverUrl: string;
  authMode: AuthMode;
  /** Bearer token; only in token mode. The password is never stored. */
  token: string | null;
}

// storage.local only: storage.sync is unencrypted and replicated.
const settingsItem = storage.defineItem<Settings | null>('local:settings', {
  fallback: null,
});

export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function loadSettings(): Promise<Settings | null> {
  return settingsItem.getValue();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue({
    ...settings,
    serverUrl: normalizeServerUrl(settings.serverUrl),
  });
}
