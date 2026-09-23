import { browser } from 'wxt/browser';
import { isAuthFailure } from '../lib/api/errors';
import { clientFromSettings } from '../lib/client-factory';
import { createTranslator, localeFor, type Translator } from '../lib/i18n';
import { setIcon, setTitle, type IconState } from '../lib/icon';
import { sessionStore } from '../lib/platform/session-store';
import { loadExisting } from '../lib/save';
import { createSavedState } from '../lib/saved-state';
import { loadSettings } from '../lib/settings';

/** Long enough that flicking through tabs costs one request, not ten. */
const LOOKUP_DELAY_MS = 400;

let t: Translator = createTranslator(localeFor(null));

/** Re-read whenever settings change: the language may have changed too. */
async function refreshLanguage(): Promise<void> {
  const settings = await loadSettings();
  t = createTranslator(localeFor(settings?.language ?? null));
}

const savedState = createSavedState({
  look: async (url) => {
    const settings = await loadSettings();
    if (settings === null || settings.token === null) throw new Error('not configured');
    return (
      (await loadExisting(
        clientFromSettings(settings, localeFor(settings.language)),
        url,
      )) !== null
    );
  },
  now: () => Date.now(),
  isUnauthorized: isAuthFailure,
  // Chrome's MV3 worker dies after 30 seconds idle; without this it
  // re-asks the server about every tab it has already asked about.
  store: sessionStore('saved-state'),
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
  await setTitle(t('toolbar.name'), tabId);
  clearTimeout(pending);
  pending = setTimeout(() => {
    void savedState.get(url).then(async (answer) => {
      if (answer === 'unauthorized') {
        // Grey, like unconfigured — because in every way that matters it
        // is: nothing works until there is a new token. The tooltip says
        // which of the two it is.
        await setIcon('unconfigured', tabId);
        await setTitle(t('toolbar.signInAgain'), tabId);
        return;
      }
      const state: IconState = answer === 'held' ? 'saved' : 'configured';
      await setIcon(state, tabId);
    });
  }, LOOKUP_DELAY_MS);
}

export default defineBackground(() => {
  void refreshLanguage();
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
    // A new token deserves a fresh ask, and the language may have
    // changed with it.
    savedState.reset();
    void refreshLanguage().then(() => {
      void paintGlobal();
      void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (tab?.id !== undefined) void paint(tab.id, tab.url);
      });
    });
  });
});
