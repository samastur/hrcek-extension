import { storage } from '#imports';

export interface Settings {
  /** Base address of the Hrček server, no trailing slash. */
  serverUrl: string;
  /**
   * Bearer token — the only credential this client keeps. A password is
   * used once to mint a token and never stored.
   */
  token: string | null;
}

// storage.local only: storage.sync is unencrypted and replicated.
const settingsItem = storage.defineItem<(Settings & { authMode?: string }) | null>(
  'local:settings',
  { fallback: null },
);

export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function loadSettings(): Promise<Settings | null> {
  const stored = await settingsItem.getValue();
  if (stored === null) return null;
  // Older versions stored an authMode; session auth is gone, so ignore it.
  return { serverUrl: stored.serverUrl, token: stored.token };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue({
    serverUrl: normalizeServerUrl(settings.serverUrl),
    token: settings.token,
  });
}
