import { storage } from '#imports';

export interface Settings {
  /** Base address of the Hrček server, no trailing slash. */
  serverUrl: string;
  /**
   * Bearer token — the only credential this client keeps. A password is
   * used once to mint a token and never stored.
   */
  token: string | null;
  /**
   * Whether the toolbar says that a page is already saved. Doing so means
   * asking the server about every address visited, so it is a choice, not
   * a given. On by default: it is the useful behaviour, and the cost is
   * stated where it is switched.
   */
  showSavedState: boolean;
}

// storage.local only: storage.sync is unencrypted and replicated.
const settingsItem = storage.defineItem<
  | (Omit<Settings, 'showSavedState'> & { authMode?: string; showSavedState?: boolean })
  | null
>('local:settings', { fallback: null });

export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export async function loadSettings(): Promise<Settings | null> {
  const stored = await settingsItem.getValue();
  if (stored === null) return null;
  // Older versions stored an authMode; session auth is gone, so ignore it.
  return {
    serverUrl: stored.serverUrl,
    token: stored.token,
    // Absent in settings written before the switch existed.
    showSavedState: stored.showSavedState ?? true,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await settingsItem.setValue({
    serverUrl: normalizeServerUrl(settings.serverUrl),
    token: settings.token,
    showSavedState: settings.showSavedState,
  });
}
