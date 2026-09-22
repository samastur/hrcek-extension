import { browser } from 'wxt/browser';
import { clientFromSettings } from '../lib/client-factory';
import { setIcon, type IconState } from '../lib/icon';
import { loadExisting } from '../lib/save';
import { createSavedState } from '../lib/saved-state';
import { loadSettings } from '../lib/settings';

/** Long enough that flicking through tabs costs one request, not ten. */
const LOOKUP_DELAY_MS = 400;

const savedState = createSavedState({
  look: async (url) => {
    const settings = await loadSettings();
    if (settings === null || settings.token === null) throw new Error('not configured');
    return (await loadExisting(clientFromSettings(settings), url)) !== null;
  },
  now: () => Date.now(),
});

let pending: ReturnType<typeof setTimeout> | undefined;

/** Nothing to save on about:, chrome:// or a file the browser is rendering. */
function isSaveable(url: string | undefined): url is string {
  return url !== undefined && (url.startsWith('http://') || url.startsWith('https://'));
}

/**
 * The toolbar button's resting state, with no tab in mind. Painted once at
 * start and again whenever settings change, so a window whose tabs fire
 * neither onActivated nor onUpdated still shows something other than the
 * manifest's default colour icon.
 */
async function paintGlobal(): Promise<void> {
  const settings = await loadSettings();
  const configured = settings !== null && settings.token !== null;
  await setIcon(configured ? 'configured' : 'unconfigured');
}

async function paint(tabId: number, url: string | undefined): Promise<void> {
  const settings = await loadSettings();
  const configured = settings !== null && settings.token !== null;
  if (!configured) return setIcon('unconfigured', tabId);
  if (!settings.showSavedState || !isSaveable(url)) return setIcon('configured', tabId);

  // Colour until proven ticked. A failure leaves it here: "we could not
  // ask" is not "you have not saved it".
  await setIcon('configured', tabId);
  clearTimeout(pending);
  pending = setTimeout(() => {
    void savedState.get(url).then((held) => {
      const state: IconState = held === true ? 'saved' : 'configured';
      void setIcon(state, tabId);
    });
  }, LOOKUP_DELAY_MS);
}

export default defineBackground(() => {
  void paintGlobal();

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(
      (tab) => paint(tabId, tab.url),
      () => undefined,
    );
  });

  browser.tabs.onUpdated.addListener((tabId, changes, tab) => {
    // Only when the address changed or the page finished arriving; every
    // other update is noise.
    if (changes.url === undefined && changes.status !== 'complete') return;
    void paint(tabId, tab.url);
  });

  // The popup says so the moment it saves, rather than waiting for a
  // lookup to expire.
  browser.runtime.onMessage.addListener((message: unknown) => {
    const saved = message as { type?: string; url?: string; held?: boolean };
    if (saved.type !== 'hrcek:saved' || saved.url === undefined) return undefined;
    const url = saved.url;
    savedState.mark(url, saved.held ?? true);
    // Repaint with the address the message carried, not a freshly-queried
    // tab.url — they can differ (trailing slash, www., case), and the
    // point is to reflect the entry that was just marked.
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void paint(tab.id, url);
    });
    return undefined;
  });

  browser.storage.local.onChanged.addListener((changes) => {
    if (!('settings' in changes)) return;
    void paintGlobal();
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) void paint(tab.id, tab.url);
    });
  });
});
